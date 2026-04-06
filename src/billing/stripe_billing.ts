import StripeConstructor from 'stripe';
import type { Stripe } from 'stripe';
import http from 'http';
import { UserDB } from '../auth/user_db';
import { logger } from '../reporting/logs';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';       // monthly recurring price
const SIGNUP_FEE_AMOUNT = Number(process.env.SIGNUP_FEE_CENTS || '4999'); // $49.99 default

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripe = new (StripeConstructor as any)(STRIPE_SECRET_KEY) as Stripe;
  }
  return stripe;
}

export function isStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY && !!STRIPE_PRICE_ID;
}

/**
 * Create a Stripe Checkout Session that charges a one-time signup fee
 * AND starts a monthly subscription.
 */
export async function createCheckoutSession(
  userDb: UserDB,
  userId: string,
  email: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const s = getStripe();

  // Create or reuse Stripe customer
  const user = userDb.getUserById(userId);
  let customerId = user?.stripeCustomerId ?? undefined;

  if (!customerId) {
    const customer = await s.customers.create({ email, metadata: { userId } });
    customerId = customer.id;
    userDb.updateStripeCustomer(userId, customerId);
  }

  const lineItems: Array<{
    price_data?: { currency: string; product_data: { name: string }; unit_amount: number };
    price?: string;
    quantity: number;
  }> = [];

  // One-time signup fee
  if (SIGNUP_FEE_AMOUNT > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Polymarket Bot — Signup Fee' },
        unit_amount: SIGNUP_FEE_AMOUNT,
      },
      quantity: 1,
    });
  }

  // Monthly subscription
  if (STRIPE_PRICE_ID) {
    lineItems.push({
      price: STRIPE_PRICE_ID,
      quantity: 1,
    });
  }

  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
    subscription_data: {
      metadata: { userId },
    },
  });

  return session.url ?? '';
}

/**
 * Handle Stripe webhook events.
 * Returns true if the event was processed.
 */
export async function handleWebhook(
  req: http.IncomingMessage,
  rawBody: Buffer,
  userDb: UserDB,
): Promise<{ status: number; body: unknown }> {
  const s = getStripe();

  let event: any;
  try {
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'] as string;
      event = s.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(rawBody.toString());
    }
  } catch (err) {
    logger.error({ err }, 'Stripe webhook signature verification failed');
    return { status: 400, body: { error: 'Webhook signature verification failed' } };
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as any;
      const userId = session.metadata?.userId;
      if (userId && session.subscription) {
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        userDb.updateSubscription(userId, subId, 'active');
        logger.info({ userId, subscriptionId: subId }, 'Subscription activated via checkout');
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as any;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      userDb.updateSubscriptionByCustomerId(customerId, sub.id, sub.status);
      logger.info({ customerId, subscriptionId: sub.id, status: sub.status }, 'Subscription status updated');
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as any;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        const user = userDb.getUserByStripeCustomerId(customerId);
        if (user) {
          userDb.updateSubscription(user.id, user.subscriptionId ?? '', 'past_due');
          logger.warn({ userId: user.id }, 'Invoice payment failed — subscription past_due');
        }
      }
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe event');
  }

  return { status: 200, body: { received: true } };
}

/**
 * Create a billing portal session for the user to manage their subscription.
 */
export async function createPortalSession(
  userDb: UserDB,
  userId: string,
  returnUrl: string,
): Promise<string> {
  const s = getStripe();
  const user = userDb.getUserById(userId);
  if (!user?.stripeCustomerId) throw new Error('No Stripe customer found');

  const session = await s.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}
