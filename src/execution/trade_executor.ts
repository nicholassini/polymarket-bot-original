import { OrderRequest } from '../types';
import { ExecutionWallet } from '../wallets/wallet_manager';
import type { PendingOrder } from '../types/order';

interface OrderTrackerRef {
  addPendingOrder(order: PendingOrder): void;
}

export class TradeExecutor {
  private orderTracker: OrderTrackerRef | null = null;

  setOrderTracker(tracker: OrderTrackerRef): void {
    this.orderTracker = tracker;
  }

  async execute(order: OrderRequest, wallet: ExecutionWallet): Promise<void> {
    const result = await wallet.placeOrder({
      marketId: order.marketId,
      outcome: order.outcome,
      side: order.side,
      price: order.price,
      size: order.size,
    }) as { status?: string; orderId?: string | null } | null | undefined;

    if (result?.status === 'submitted' && result.orderId && this.orderTracker) {
      const now = new Date().toISOString();
      const pending: PendingOrder = {
        orderId: result.orderId,
        walletId: order.walletId,
        submission: {
          marketId: order.marketId,
          outcome: order.outcome,
          side: order.side,
          price: order.price,
          size: order.size,
        },
        submittedAt: now,
        lastCheckedAt: now,
        checkCount: 0,
      };
      this.orderTracker.addPendingOrder(pending);
    }
  }
}
