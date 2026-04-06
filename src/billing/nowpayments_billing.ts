/**
 * NOWPayments crypto payment integration.
 * Creates invoices and handles IPN (Instant Payment Notification) callbacks.
 *
 * Flow:
 *  1. User clicks "Pay with Crypto" → we create an invoice via NOWPayments API
 *  2. User is redirected to the NOWPayments hosted invoice page
 *  3. After payment, NOWPayments sends an IPN callback to our webhook
 *  4. We verify the HMAC signature and activate the subscription
 *
 * Since crypto doesn't have native recurring billing, we grant 30 days of
 * 'active' status per payment. Users must re-pay each month.
 */
import http from 'http';
import crypto from 'crypto';
import { UserDB } from '../auth/user_db';
import { logger } from '../reporting/logs';

const NP_API_BASE = 'https://api.nowpayments.io/v1';

export function isNowPaymentsConfigured(): boolean {
  return !!(process.env.NOWPAYMENTS_API_KEY);
}

/**
 * Create a NOWPayments invoice.
 * Returns the invoice URL where the user completes crypto payment.
 */
export async function createNPInvoice(
  userId: string,
  email: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  if (!isNowPaymentsConfigured()) {
    throw new Error('NOWPayments is not configured');
  }

  const response = await fetch(`${NP_API_BASE}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.NOWPAYMENTS_API_KEY || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: Number(process.env.NOWPAYMENTS_PRICE_USD || '99'),
      price_currency: 'usd',
      order_id: userId,
      order_description: 'Polymarket Bot Pro — 1 Month',
      ipn_callback_url: `${successUrl.split('/dashboard')[0]}/api/billing/nowpayments/webhook`,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, body: errorText }, 'NOWPayments invoice creation failed');
    throw new Error(`NOWPayments API error: ${response.status}`);
  }

  const result = await response.json() as any;
  return result.invoice_url;
}

/**
 * Handle NOWPayments IPN (webhook) callback.
 * Verifies HMAC-SHA512 signature and processes payment status.
 */
export async function handleNPWebhook(
  req: http.IncomingMessage,
  rawBody: Buffer,
  userDb: UserDB,
): Promise<{ status: number; body: unknown }> {
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }

  // Verify HMAC signature
  const npPublicKey = process.env.NOWPAYMENTS_PUBLIC_KEY || '';
  if (npPublicKey) {
    const receivedSig = req.headers['x-nowpayments-sig'] as string;
    if (!receivedSig) {
      return { status: 400, body: { error: 'Missing IPN signature' } };
    }

    const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    const hmac = crypto.createHmac('sha512', npPublicKey);
    hmac.update(sortedPayload);
    const expected = hmac.digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expected))) {
      logger.error('NOWPayments IPN signature mismatch');
      return { status: 400, body: { error: 'Invalid signature' } };
    }
  }

  const paymentId = String(payload.payment_id ?? '');
  const paymentStatus: string = payload.payment_status ?? '';
  const userId: string = payload.order_id ?? '';

  if (!userId) {
    logger.warn({ paymentId, paymentStatus }, 'NOWPayments IPN missing order_id (userId)');
    return { status: 200, body: { received: true, skipped: 'no order_id' } };
  }

  logger.info({ userId, paymentId, paymentStatus }, 'NOWPayments IPN received');

  switch (paymentStatus) {
    case 'finished':
    case 'confirmed': {
      // Payment confirmed — activate subscription for this user
      userDb.updateSubscription(userId, `np_${paymentId}`, 'active');
      userDb.updatePaymentProvider(userId, 'nowpayments');
      logger.info({ userId, paymentId }, 'NOWPayments: subscription activated (30 days)');
      break;
    }

    case 'partially_paid': {
      logger.warn({ userId, paymentId }, 'NOWPayments: partial payment received');
      // Don't activate — user needs to complete payment
      break;
    }

    case 'failed':
    case 'refunded':
    case 'expired': {
      // Only downgrade if the payment was for the current subscription
      const user = userDb.getUserById(userId);
      if (user && user.subscriptionId === `np_${paymentId}`) {
        userDb.updateSubscription(userId, `np_${paymentId}`, 'canceled');
        logger.info({ userId, paymentId, paymentStatus }, 'NOWPayments: subscription deactivated');
      }
      break;
    }

    default:
      logger.debug({ paymentStatus, paymentId }, 'Unhandled NOWPayments status');
  }

  return { status: 200, body: { received: true } };
}
