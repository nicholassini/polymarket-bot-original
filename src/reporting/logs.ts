import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT != null;

// pino-pretty is CPU-expensive (synchronous formatting per-line) — only use locally.
// In production, raw JSON to stdout is near-zero overhead and Railway parses it natively.
const logger = isProd
  ? pino({ level: process.env.LOG_LEVEL ?? 'warn' })
  : pino(
      { level: process.env.LOG_LEVEL ?? 'info' },
      pino.transport({ target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }),
    );

export { logger };
