import { logger } from '../reporting/logs';

export type TickHandler = () => Promise<void> | void;

/**
 * Non-overlapping scheduler: uses setTimeout chain so the next tick
 * only fires AFTER the previous one completes.  setInterval allows
 * overlapping ticks when a tick takes longer than the interval, which
 * starves the event loop and causes request timeouts.
 */
export class Scheduler {
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private readonly intervalMs: number;

  constructor(intervalMs = 5000) {
    this.intervalMs = intervalMs;
  }

  start(handler: TickHandler): void {
    if (this.timer) return;
    this.stopped = false;

    const loop = () => {
      if (this.stopped) return;
      this.timer = setTimeout(async () => {
        try {
          await handler();
        } catch (error) {
          logger.error({ error }, 'Scheduler tick failed');
        }
        loop(); // schedule next tick after this one finishes
      }, this.intervalMs);
    };
    loop();
    logger.info({ intervalMs: this.intervalMs }, 'Scheduler started (non-overlapping)');
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      logger.info('Scheduler stopped');
    }
  }
}
