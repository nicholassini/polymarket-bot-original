import { describe, it, expect, vi } from 'vitest';
import { TradeExecutor } from '../src/execution/trade_executor';
import type { ExecutionWallet } from '../src/wallets/wallet_manager';
import type { OrderRequest } from '../src/types';
import type { PendingOrder } from '../src/types/order';

function makeOrder(overrides: Partial<OrderRequest> = {}): OrderRequest {
  return {
    walletId: 'w1',
    marketId: 'm1',
    outcome: 'YES',
    side: 'BUY',
    price: 0.5,
    size: 10,
    strategy: 'momentum',
    ...overrides,
  };
}

function makeWallet(placeOrderResult: unknown): ExecutionWallet {
  return {
    getState: vi.fn(),
    getTradeHistory: vi.fn().mockReturnValue([]),
    updateBalance: vi.fn(),
    placeOrder: vi.fn().mockResolvedValue(placeOrderResult),
  } as unknown as ExecutionWallet;
}

describe('TradeExecutor — OrderTracker wiring', () => {
  it('calls orderTracker.addPendingOrder when live wallet returns submitted', async () => {
    const addPendingOrder = vi.fn();
    const executor = new TradeExecutor();
    executor.setOrderTracker({ addPendingOrder });

    const wallet = makeWallet({ status: 'submitted', orderId: 'clob-order-abc', filledSize: 0 });
    const order = makeOrder();

    await executor.execute(order, wallet);

    expect(addPendingOrder).toHaveBeenCalledOnce();
    const pending = addPendingOrder.mock.calls[0][0] as PendingOrder;
    expect(pending.orderId).toBe('clob-order-abc');
    expect(pending.walletId).toBe('w1');
    expect(pending.submission.marketId).toBe('m1');
    expect(pending.submission.price).toBe(0.5);
    expect(pending.submission.size).toBe(10);
    expect(pending.checkCount).toBe(0);
  });

  it('does NOT call orderTracker when paper wallet returns filled', async () => {
    const addPendingOrder = vi.fn();
    const executor = new TradeExecutor();
    executor.setOrderTracker({ addPendingOrder });

    const wallet = makeWallet({ status: 'filled', orderId: 'paper-order', filledSize: 10 });
    await executor.execute(makeOrder(), wallet);

    expect(addPendingOrder).not.toHaveBeenCalled();
  });

  it('does NOT call orderTracker when status is rejected', async () => {
    const addPendingOrder = vi.fn();
    const executor = new TradeExecutor();
    executor.setOrderTracker({ addPendingOrder });

    const wallet = makeWallet({ status: 'rejected', orderId: null, filledSize: 0 });
    await executor.execute(makeOrder(), wallet);

    expect(addPendingOrder).not.toHaveBeenCalled();
  });

  it('does NOT call orderTracker when no tracker is set', async () => {
    const executor = new TradeExecutor();
    const wallet = makeWallet({ status: 'submitted', orderId: 'order-1', filledSize: 0 });

    // Should not throw even without a tracker
    await expect(executor.execute(makeOrder(), wallet)).resolves.toBeUndefined();
  });

  it('does NOT call orderTracker when placeOrder returns void (legacy wallet)', async () => {
    const addPendingOrder = vi.fn();
    const executor = new TradeExecutor();
    executor.setOrderTracker({ addPendingOrder });

    const wallet = makeWallet(undefined);
    await executor.execute(makeOrder(), wallet);

    expect(addPendingOrder).not.toHaveBeenCalled();
  });
});
