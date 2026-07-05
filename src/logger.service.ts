import {
  ConsoleLogger,
  Inject,
  Injectable,
  type LogLevel as NestLogLevel,
  Optional,
  Scope,
} from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';
import { getCorrelationId, getStore } from './context/als';
import { LOG_DISPATCHER, LOGGER_OPTIONS } from './logger.constants';
import type { LogDispatcher } from './logger.dispatcher';
import type {
  LogLevel,
  LogRecord,
  ResolvedLoggerOptions,
} from './logger.interfaces';

/**
 * Drop-in replacement for NestJS' built-in logger.
 *
 * - Preserves 100% of the native `ConsoleLogger` behavior, including the
 *   NestJS 11 structured-JSON output (`{ json: true }`).
 * - Automatically derives its context from the injecting class via the
 *   `INQUIRER` token — no token registration, no global state.
 * - Converts every message into a normalized {@link LogRecord} and fans it
 *   out to the configured exporters through the {@link LogDispatcher}.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends ConsoleLogger {
  private readonly dispatcher?: LogDispatcher;

  constructor(
    @Optional() @Inject(INQUIRER) parent?: object | string,
    @Optional() @Inject(LOG_DISPATCHER) dispatcher?: LogDispatcher,
    @Optional() @Inject(LOGGER_OPTIONS) options?: ResolvedLoggerOptions,
  ) {
    super(LoggerService.contextFrom(parent), {
      json: options?.json ?? false,
      colors: options?.colors,
      logLevels: options?.level
        ? LoggerService.enabledLevels(options.level)
        : undefined,
    });

    this.dispatcher = dispatcher;
  }

  private static contextFrom(parent?: object | string): string {
    if (typeof parent === 'string') {
      return parent;
    }

    return parent?.constructor?.name ?? 'Application';
  }

  private static enabledLevels(min: LogLevel): NestLogLevel[] {
    const order: LogLevel[] = [
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ];
    const floor = order.indexOf(min);

    return order.slice(floor) as NestLogLevel[];
  }

  /**
   * Single choke point for every emitted message. Delegates to the native
   * implementation for stdout output, then mirrors the entry to the
   * exporters as a structured record.
   */
  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel: NestLogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    super.printMessages(
      messages,
      context,
      logLevel,
      writeStreamType,
      errorStack,
    );

    this.dispatcher?.dispatch(
      this.toRecord(messages, context, logLevel as LogLevel, errorStack),
    );
  }

  private toRecord(
    messages: unknown[],
    context: string | undefined,
    level: LogLevel,
    errorStack?: unknown,
  ): LogRecord {
    const textParts: string[] = [];
    let meta: Record<string, unknown> | undefined;

    for (const message of messages) {
      if (message !== null && typeof message === 'object') {
        meta = { ...(meta ?? {}), ...(message as Record<string, unknown>) };
      } else {
        textParts.push(String(message));
      }
    }

    const store = getStore();
    if (store) {
      const extra = Object.fromEntries(
        Object.entries(store).filter(([key]) => key !== 'correlationId'),
      );
      if (Object.keys(extra).length) {
        meta = { ...(meta ?? {}), ...extra };
      }
    }

    return {
      level,
      message: textParts.join(' '),
      context: context ?? this.context,
      timestamp: Date.now(),
      pid: process.pid,
      stack: typeof errorStack === 'string' ? errorStack : undefined,
      correlationId: getCorrelationId(),
      meta,
    };
  }
}
