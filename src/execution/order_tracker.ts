import { Database } from '../storage/database';
import { WalletManager } from '../wallets/wallet_manager';
import { PendingOrder } from '../types/order';
import { OrderFill } from '../types';
import { logger } from '../reporting/logs';
import { notify } from '../reporting/notifier';
import type { ClobClient } from '@polymarket/clob-client-v2';

export class OrderTracker {
  private readonly pending = new Map<string, PendingOrder>();
  private readonly pollIntervalMs = 5_000;
  private maxOrderAgeMs: number;
  private readonly maxCheckAttempts = 30;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  constructor(
    private readonly db: Database,
    private readonly walletManager: WalletManager,
    private readonly clobClient: ClobClient,
  ) {
    this.maxOrderAgeMs = 120_000;
  }

  setOrderTimeoutMs(ms: number): void {
    this.maxOrderAgeMs = ms;
  }

  start(): void {
    // Restore any pending orders from DB that survived a crash
    const saved = this.db.loadPendingOrders();
    for (const order of saved) {
      if (!this.pending.has(order.orderId)) {
        this.pending.set(order.orderId, order);
      }
    }
    if (saved.length > 0) {
      logger.info({ count: saved.length }, `OrderTracker: resumed ${saved.length} pending order(s) from DB`);
    }

    this.timer = setInterval(() => {
      void this.pollPendingOrders();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Attempt to cancel all remaining pending orders
    const orders = Array.from(this.pending.values());
    if (orders.length > 0) {
      logger.info({ count: orders.length }, 'OrderTracker: cancelling pending orders on shutdown');
      for (const order of orders) {
        void this.cancelOrder(order, 'shutdown');
      }
    }
  }

  addPendingOrder(order: PendingOrder): void {
    this.pending.set(order.orderId, order);
    this.db.savePendingOrder(order);
    logger.info(
      { orderId: order.orderId, walletId: order.walletId, marketId: order.submission.marketId },
      `OrderTracker: tracking order ${order.orderId}`,
    );
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  getPendingForWallet(walletId: string): PendingOrder[] {
    return Array.from(this.pending.values()).filter((o) => o.walletId === walletId);
  }

  private async pollPendingOrders(): Promise<void> {
    if (this.isPolling) {
      logger.warn('OrderTracker: previous poll still running — skipping this tick');
      return;
    }
    this.isPolling = true;
    try {
      await this._doPoll();
    } finally {
      this.isPolling = false;
    }
  }

  private async _doPoll(): Promise<void> {
    const now = Date.now();
    const orders = Array.from(this.pending.values());

    for (const order of orders) {
      const ageMs = now - new Date(order.submittedAt).getTime();

      // Timed out — cancel before checking status
      if (ageMs > this.maxOrderAgeMs) {
        logger.warn(
          { orderId: order.orderId, ageMs },
          `OrderTracker: order ${order.orderId} timed out after ${ageMs}ms — cancelling`,
        );
        notify(`Order timeout and cancelled: ${order.orderId} (wallet=${order.walletId})`, 'warn');
        await this.cancelOrder(order, 'timeout');
        continue;
      }

      // Too many failed checks — treat as stale
      if (order.checkCount > this.maxCheckAttempts) {
        logger.warn(
          { orderId: order.orderId, checkCount: order.checkCount },
          `OrderTracker: order ${order.orderId} exceeded max check attempts — cancelling`,
        );
        notify(`Order stale after ${order.checkCount} failed checks: ${order.orderId} (wallet=${order.walletId})`, 'warn');
        await this.cancelOrder(order, 'stale');
        continue;
      }

      // Poll status via V2 SDK
      try {
        const data = await this.clobClient.getOrder(order.orderId);
        const clobStatus = (data.status ?? '').toUpperCase();
        const filledSizeStr = data.size_matched ?? '0';
        const priceStr = data.price ?? String(order.submission.price);

        if (clobStatus === 'MATCHED') {
          const filledSize = Number(filledSizeStr) || order.submission.size;
          const fillPrice = Number(priceStr) || order.submission.price;
          this.applyConfirmedFill(order, filledSize, fillPrice, 'filled');
        } else if (clobStatus === 'CANCELLED') {
          logger.warn({ orderId: order.orderId }, `OrderTracker: order ${order.orderId} was cancelled by exchange`);
          notify(`Order cancelled by exchange: ${order.orderId} (wallet=${order.walletId})`, 'warn');
          const cancelledWallet = this.walletManager.getWallet(order.walletId);
          cancelledWallet?.releaseBalance?.(order.submission.price * order.submission.size);
          this.removePending(order.orderId);
        } else if (clobStatus === 'PARTIALLY_MATCHED') {
          const filledSize = Number(filledSizeStr) || 0;
          if (filledSize > 0) {
            const fillPrice = Number(priceStr) || order.submission.price;
            this.applyConfirmedFill(order, filledSize, fillPrice, 'partially_filled');
            // Update the remaining size in the pending order
            order.submission = { ...order.submission, size: order.submission.size - filledSize };
            order.lastCheckedAt = new Date().toISOString();
            order.checkCount++;
            this.pending.set(order.orderId, order);
            this.db.savePendingOrder(order);
          } else {
            order.checkCount++;
            order.lastCheckedAt = new Date().toISOString();
            this.db.savePendingOrder(order);
          }
        } else {
          // UNMATCHED or unknown — still pending
          order.checkCount++;
          order.lastCheckedAt = new Date().toISOString();
          this.pending.set(order.orderId, order);
          this.db.savePendingOrder(order);
        }
      } catch (err) {
        order.checkCount++;
        order.lastCheckedAt = new Date().toISOString();
        this.pending.set(order.orderId, order);
        this.db.savePendingOrder(order);
        logger.warn({ orderId: order.orderId, err: err instanceof Error ? err.message : String(err) }, 'OrderTracker: error checking order status');
      }
    }
  }

  private applyConfirmedFill(
    order: PendingOrder,
    filledSize: number,
    fillPrice: number,
    fillType: 'filled' | 'partially_filled',
  ): void {
    const wallet = this.walletManager.getWallet(order.walletId);
    if (!wallet || !wallet.applyFill) {
      logger.warn({ orderId: order.orderId, walletId: order.walletId }, 'OrderTracker: wallet not found or no applyFill — skipping');
      if (fillType === 'filled') this.removePending(order.orderId);
      return;
    }

    const fill: OrderFill = {
      orderId: order.orderId,
      marketId: order.submission.marketId,
      outcome: order.submission.outcome,
      side: order.submission.side,
      price: fillPrice,
      size: filledSize,
      timestamp: Date.now(),
    };

    wallet.applyFill(fill);

    logger.info(
      { orderId: order.orderId, walletId: order.walletId, fillType, filledSize, fillPrice },
      `OrderTracker: ${fillType} confirmed for order ${order.orderId}`,
    );

    if (fillType === 'filled') {
      this.removePending(order.orderId);
    }
  }

  private async cancelOrder(order: PendingOrder, reason: string): Promise<void> {
    try {
      await this.clobClient.cancelOrder({ orderID: order.orderId });
      logger.info({ orderId: order.orderId, reason }, `OrderTracker: cancel request sent for order ${order.orderId}`);
    } catch (err) {
      logger.warn({ orderId: order.orderId, err: err instanceof Error ? err.message : String(err) }, 'OrderTracker: cancel request failed');
    } finally {
      const wallet = this.walletManager.getWallet(order.walletId);
      wallet?.releaseBalance?.(order.submission.price * order.submission.size);
      this.removePending(order.orderId);
    }
  }

  private removePending(orderId: string): void {
    this.pending.delete(orderId);
    this.db.removePendingOrder(orderId);
  }
}
