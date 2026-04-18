export interface OrderSubmission {
  marketId: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
}

export interface OrderResult {
  orderId: string | null;
  status: 'submitted' | 'filled' | 'partially_filled' | 'rejected' | 'error' | 'cancelled';
  filledSize: number;
  filledPrice: number;
  reason?: string;
  timestamp: string;
}

export interface PendingOrder {
  orderId: string;
  walletId: string;
  submission: OrderSubmission;
  submittedAt: string;
  lastCheckedAt: string;
  checkCount: number;
}
