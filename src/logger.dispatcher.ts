import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { LOGGER_OPTIONS } from './logger.constants';
import type {
  LogExporter,
  LogRecord,
  ResolvedLoggerOptions,
} from './logger.interfaces';
import { redactRecord } from './logger.utils';

/**
 * Central log fan-out. Buffers records and flushes them to every
 * registered exporter in batches, isolating exporter failures so a single
 * broken destination never impacts the application or the other exporters.
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
   * Queue a record for export. Applies redaction, buffers it, and triggers
   * a flush when the batch size is reached. Never throws.
   */
  dispatch(record: LogRecord): void {
    if (!this.exporters.length) {
      return;
    }

    try {
      this.buffer.push(redactRecord(record, this.options.redact));

      if (this.buffer.length >= this.options.batch.size) {
        void this.flush();
      } else {
        this.ensureTimer();
      }
    } catch (err) {
      this.diag.error(`Failed to queue log record: ${String(err)}`);
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
   * Drain the buffer to every exporter concurrently. Exporter errors are
   * captured per-exporter and logged, never propagated.
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

    await Promise.allSettled(
      this.exporters.map(async (exporter) => {
        try {
          await exporter.export(batch);
        } catch (err) {
          this.diag.error(
            `Exporter "${exporter.name}" failed to export ${batch.length} record(s): ${String(err)}`,
          );
        }
      }),
    );
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

  /** @internal Whether all exporters have been initialized. */
  get isReady(): boolean {
    return this.ready;
  }
}
