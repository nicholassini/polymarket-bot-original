import { logger } from './logs';

let telegramWebhookUrl: string | undefined;

export function initNotifier(webhookUrl?: string): void {
  telegramWebhookUrl = webhookUrl;
}

export function notify(message: string, level: 'info' | 'warn' | 'critical'): void {
  const text = `[${level.toUpperCase()}] ${message}`;
  if (level === 'critical') {
    logger.error(text);
  } else if (level === 'warn') {
    logger.warn(text);
  } else {
    logger.info(text);
  }

  if (!telegramWebhookUrl) return;

  fetch(telegramWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    // notification failures must never crash the bot
  });
}
