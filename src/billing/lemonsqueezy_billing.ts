/**
 * Lemon Squeezy billing integration.
 * Creates checkout sessions and handles webhook events for subscriptions.
 */
import http from 'http';
import crypto from 'crypto';
import { UserDB } from '../auth/user_db';
import { logger } from '../reporting/logs';

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';

export function isLemonSqueezyConfigured(): boolean {
  return !!(process.env.LEMONSQUEEZY_API_KEY) && !!(process.env.LEMONSQUEEZY_STORE_ID) && !!(process.env.LEMONSQUEEZY_VARIANT_ID);
}

/**
 * Create a Lemon Squeezy checkout session.
 * Returns the checkout URL.
 */
export async function createLSCheckoutSession(
  userId: string,
  email: string,
  successUrl: string,
): Promise<string> {
  if (!isLemonSqueezyConfigured()) {
    throw new Error('Lemon Squeezy is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(`${LS_API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY || ''}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email,
              custom: { user_id: userId },
            },
            product_options: {
              redirect_url: successUrl,
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID || '' } },
            variant: { data: { type: 'variants', id: process.env.LEMONSQUEEZY_VARIANT_ID || '' } },
          },
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, body: errorText }, 'Lemon Squeezy checkout creation failed');
    throw new Error(`Lemon Squeezy API error: ${response.status}`);
  }

  const result = await response.json() as any;
  return result.data.attributes.url;
}

/**
 * Handle Lemon Squeezy webhook events.
 * Verifies HMAC signature and processes subscription events.
 */
export async function handleLSWebhook(
  req: http.IncomingMessage,
  rawBody: Buffer,
  userDb: UserDB,
): Promise<{ status: number; body: unknown }> {
  // Verify signature
  const lsWebhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';
  if (lsWebhookSecret) {
    const sig = req.headers['x-signature'] as string;
    if (!sig) {
      return { status: 400, body: { error: 'Missing webhook signature' } };
    }
    const hmac = crypto.createHmac('sha256', lsWebhookSecret);
    hmac.update(rawBody);
    const expected = hmac.digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      logger.error('Lemon Squeezy webhook signature mismatch');
      return { status: 400, body: { error: 'Invalid signature' } };
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }

  const eventName: string = payload.meta?.event_name ?? '';
  const userId: string = payload.meta?.custom_data?.user_id ?? '';

  if (!userId) {
    logger.warn({ eventName }, 'Lemon Squeezy webhook missing user_id in custom_data');
    return { status: 200, body: { received: true, skipped: 'no user_id' } };
  }

  const subData = payload.data?.attributes ?? {};
  const subscriptionId = String(payload.data?.id ?? '');

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_resumed': {
      userDb.updateSubscription(userId, `ls_${subscriptionId}`, 'active');
      userDb.updatePaymentProvider(userId, 'lemonsqueezy');
      logger.info({ userId, subscriptionId, eventName }, 'Lemon Squeezy subscription activated');
      break;
    }

    case 'subscription_updated': {
      const status = subData.status; // 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired'
      const mapped = mapLSStatus(status);
      userDb.updateSubscription(userId, `ls_${subscriptionId}`, mapped);
      logger.info({ userId, subscriptionId, status: mapped, eventName }, 'Lemon Squeezy subscription updated');
      break;
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      userDb.updateSubscription(userId, `ls_${subscriptionId}`, 'canceled');
      logger.info({ userId, subscriptionId, eventName }, 'Lemon Squeezy subscription ended');
      break;
    }

    case 'subscription_paused': {
      userDb.updateSubscription(userId, `ls_${subscriptionId}`, 'past_due');
      logger.info({ userId, subscriptionId, eventName }, 'Lemon Squeezy subscription paused');
      break;
    }

    case 'subscription_payment_failed': {
      userDb.updateSubscription(userId, `ls_${subscriptionId}`, 'past_due');
      logger.warn({ userId, subscriptionId }, 'Lemon Squeezy payment failed');
      break;
    }

    default:
      logger.debug({ eventName }, 'Unhandled Lemon Squeezy event');
  }

  return { status: 200, body: { received: true } };
}

function mapLSStatus(lsStatus: string): string {
  switch (lsStatus) {
    case 'active': return 'active';
    case 'on_trial': return 'trialing';
    case 'paused':
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'cancelled':
    case 'expired': return 'canceled';
    default: return lsStatus;
  }
}
