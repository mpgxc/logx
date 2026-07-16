import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { LOGGER_OPTIONS } from './logger.constants';
import type {
  DispatcherStats,
  LogExporter,
  LogRecord,
  ResolvedLoggerOptions,
} from './logger.interfaces';
import { redactRecord } from './logger.utils';

const DROP_WARN_INTERVAL_MS = 5000;

/**
 * Central log fan-out. Buffers records and flushes them to every
 * registered exporter in batches, isolating exporter failures so a single
 * broken destination never impacts the application or the other exporters.
 *
 * Resilience:
 * - The buffer is **bounded** (`maxBufferSize`); on overflow it sheds load
 *   per `dropPolicy` instead of growing without limit.
 * - Failed exports are **retried** with exponential backoff before the batch
 *   is given up on.
 *
 * Fire-and-forget: {@link LogDispatcher.dispatch} never blocks the caller
 * and never throws.
 */
@Injectable()
export class LogDispatcher implements OnModuleInit, OnApplicationShutdown {
  private readonly diag = new Logger('LogDispatcher');
  private readonly buffer: LogRecord[] = [];
  private timer: NodeJS.Timeout | null = null;
  private ready = false;

  private exportedCount = 0;
  private droppedCount = 0;
  private failedCount = 0;
  private lastDropWarn = 0;

  constructor(
    @Inject(LOGGER_OPTIONS)
    private readonly options: ResolvedLoggerOptions,
  ) {}

  private get exporters(): LogExporter[] {
    return this.options.exporters;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.options.traceContext?.init?.();
    } catch (err) {
      this.diag.error(
        `Trace context provider "${this.options.traceContext?.name}" failed to initialize: ${String(err)}`,
      );
    }

    await Promise.allSettled(
      this.exporters.map(async (exporter) => {
        try {
          await exporter.init?.();
        } catch (err) {
          this.diag.error(
            `Exporter "${exporter.name}" failed to initialize: ${String(err)}`,
          );
        }
      }),
    );

    this.ready = true;
  }

  /**
   * Queue a record for export. Applies redaction, buffers it (shedding load
   * if the buffer is full), and triggers a flush when the batch size is
   * reached. Never throws.
   */
  dispatch(record: LogRecord): void {
    if (!this.exporters.length) {
      return;
    }

    try {
      const redacted = redactRecord(record, this.options.redact);

      if (this.buffer.length >= this.options.maxBufferSize) {
        if (this.options.dropPolicy === 'newest') {
          this.onDrop();
          return; // reject the incoming record
        }
        this.buffer.shift(); // drop oldest
        this.onDrop();
      }

      this.buffer.push(redacted);

      if (this.buffer.length >= this.options.batch.size) {
        void this.flush();
      } else {
        this.ensureTimer();
      }
    } catch (err) {
      this.diag.error(`Failed to queue log record: ${String(err)}`);
    }
  }

  private onDrop(): void {
    this.droppedCount++;

    const now = Date.now();
    if (now - this.lastDropWarn >= DROP_WARN_INTERVAL_MS) {
      this.lastDropWarn = now;
      this.diag.warn(
        `Log buffer full (max ${this.options.maxBufferSize}); shedding "${this.options.dropPolicy}" records. Total dropped: ${this.droppedCount}`,
      );
    }
  }

  private ensureTimer(): void {
    if (this.timer || !this.options.batch.intervalMs) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.batch.intervalMs);

    // Do not keep the event loop alive solely for a pending flush.
    this.timer.unref?.();
  }

  /**
   * Drain the buffer to every exporter concurrently, retrying each with
   * backoff. Exporter errors are captured per-exporter, never propagated.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.buffer.length) {
      return;
    }

    const batch = this.buffer.splice(0, this.buffer.length);

    const results = await Promise.allSettled(
      this.exporters.map((exporter) => this.exportWithRetry(exporter, batch)),
    );

    const delivered = results.some(
      (r) => r.status === 'fulfilled' && r.value === true,
    );
    if (delivered) {
      this.exportedCount += batch.length;
    }
  }

  /**
   * Attempt an export with exponential backoff. Resolves `true` on success,
   * `false` once retries are exhausted (never rejects).
   */
  private async exportWithRetry(
    exporter: LogExporter,
    batch: LogRecord[],
  ): Promise<boolean> {
    const { attempts, backoffMs, maxBackoffMs } = this.options.retry;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await exporter.export(batch);
        return true;
      } catch (err) {
        if (attempt >= attempts) {
          this.failedCount++;
          this.diag.error(
            `Exporter "${exporter.name}" failed to export ${batch.length} record(s) after ${attempts} attempt(s): ${String(err)}`,
          );
          return false;
        }
        const delay = Math.min(backoffMs * 2 ** (attempt - 1), maxBackoffMs);
        await this.sleep(delay);
      }
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref?.();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flush();

    await Promise.allSettled(
      this.exporters.map(async (exporter) => {
        try {
          await exporter.flush?.();
          await exporter.close?.();
        } catch (err) {
          this.diag.error(
            `Exporter "${exporter.name}" failed to close: ${String(err)}`,
          );
        }
      }),
    );

    this.ready = false;
  }

  /** Runtime counters for observability (buffered / exported / dropped / failed). */
  get stats(): DispatcherStats {
    return {
      buffered: this.buffer.length,
      exported: this.exportedCount,
      dropped: this.droppedCount,
      failed: this.failedCount,
    };
  }

  /** @internal Whether all exporters have been initialized. */
  get isReady(): boolean {
    return this.ready;
  }
}
