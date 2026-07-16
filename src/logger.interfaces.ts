import type { ModuleMetadata, Type } from '@nestjs/common';

/**
 * Supported log severities, ordered from least to most severe.
 * Mirrors NestJS' own `LogLevel`.
 */
export type LogLevel = 'verbose' | 'debug' | 'log' | 'warn' | 'error' | 'fatal';

/**
 * A normalized, structured log entry. Every message flowing through
 * {@link LoggerService} is converted into a `LogRecord` before being
 * handed to the exporters.
 */
export interface LogRecord {
  /** Severity of the entry. */
  level: LogLevel;
  /** Human-readable message. */
  message: string;
  /** Logical context (usually the injecting class name). */
  context?: string;
  /** Epoch milliseconds when the entry was produced. */
  timestamp: number;
  /** Process id that produced the entry. */
  pid: number;
  /** Stack trace, present for `error`/`fatal` entries when available. */
  stack?: string;
  /** Correlation id propagated from the async context, when present. */
  correlationId?: string;
  /**
   * W3C/OpenTelemetry trace id (32-char hex) propagated across the request.
   * Emitted in snake_case to match the OTel/ECS log data model so backends
   * (Loki, Datadog, Elastic) auto-correlate logs with traces.
   */
  trace_id?: string;
  /** OpenTelemetry span id (16-char hex) of the active span, when present. */
  span_id?: string;
  /** OpenTelemetry trace flags (2-char hex, e.g. `01` when sampled). */
  trace_flags?: string;
  /** Arbitrary structured metadata attached to the entry. */
  meta?: Record<string, unknown>;
}

/**
 * The trace correlation data attached to every log entry. Produced by a
 * {@link TraceContextProvider} and mapped onto the snake_case fields of a
 * {@link LogRecord}.
 */
export interface TraceContext {
  /** Trace id (32-char hex). */
  traceId?: string;
  /** Span id (16-char hex). */
  spanId?: string;
  /** Trace flags (2-char hex). */
  traceFlags?: string;
  /** Correlation id (non-OTel; survives when no tracing is active). */
  correlationId?: string;
}

/**
 * Pluggable source of trace correlation. The default implementation reads
 * from an `AsyncLocalStorage` store fed by the W3C `traceparent` header;
 * swap in {@link OtelTraceContextProvider} to read the active OpenTelemetry
 * span instead. Custom providers can bridge any tracing system.
 */
export interface TraceContextProvider {
  /** Stable identifier used in diagnostics. */
  readonly name: string;
  /** Optional async setup (e.g. importing `@opentelemetry/api`). */
  init?(): Promise<void> | void;
  /** Returns the current trace context. MUST be synchronous. */
  getContext(): TraceContext | undefined;
}

/**
 * A log destination. Implement this interface to ship logs anywhere:
 * a file, an HTTP endpoint, a database, a cloud provider, etc.
 *
 * Exporters must never throw out of {@link LogExporter.export} — the
 * dispatcher isolates failures, but a well-behaved exporter swallows its
 * own transport errors so a single bad destination never impacts the app.
 */
export interface LogExporter {
  /** Stable identifier used in diagnostics. */
  readonly name: string;
  /** Optional async setup (open connections, ensure tables, …). */
  init?(): Promise<void> | void;
  /** Receive a batch of records. Should resolve even on transport failure. */
  export(records: LogRecord[]): Promise<void> | void;
  /** Flush any internal buffering. Called on shutdown. */
  flush?(): Promise<void> | void;
  /** Tear down resources. Called on application shutdown. */
  close?(): Promise<void> | void;
}

/**
 * Batching configuration for the dispatcher. Records are buffered and
 * flushed to exporters when either threshold is reached.
 */
export interface BatchOptions {
  /** Flush once this many records are buffered. Default: 100. */
  size?: number;
  /** Flush at least this often, in milliseconds. Default: 2000. */
  intervalMs?: number;
}

/**
 * What to drop when the buffer is full:
 * - `oldest`: evict the oldest buffered record (default) — keeps the freshest.
 * - `newest`: reject the incoming record.
 */
export type DropPolicy = 'oldest' | 'newest';

/**
 * Retry policy applied per-exporter when an `export` call rejects, before the
 * batch is given up on.
 */
export interface RetryOptions {
  /** Total attempts (including the first). Default: 3. `1` disables retry. */
  attempts?: number;
  /** Base backoff in ms; grows exponentially (`backoffMs * 2^n`). Default: 200. */
  backoffMs?: number;
  /** Upper bound for a single backoff delay, in ms. Default: 5000. */
  maxBackoffMs?: number;
}

/** Runtime counters exposed by the dispatcher for observability. */
export interface DispatcherStats {
  /** Records currently sitting in the buffer. */
  buffered: number;
  /** Records successfully handed to at least one exporter. */
  exported: number;
  /** Records dropped because the buffer was full. */
  dropped: number;
  /** Batches given up on after exhausting retries (per exporter). */
  failed: number;
}

/**
 * Options accepted by {@link LoggerModule.forRoot}.
 */
export interface LoggerModuleOptions {
  /** Register the module globally. Default: false. */
  isGlobal?: boolean;
  /** Minimum level to emit. Levels are cascading. Default: env-based. */
  level?: LogLevel;
  /** Emit structured JSON to stdout. Default: true outside development. */
  json?: boolean;
  /** Colorize stdout output. Ignored when `json` is true. */
  colors?: boolean;
  /** Keys to strip from `meta` before exporting (deep). */
  redact?: string[];
  /** Destinations to fan every record out to. */
  exporters?: LogExporter[];
  /** Batching thresholds for the dispatcher. */
  batch?: BatchOptions;
  /** Max records held in the buffer before dropping. Default: 10000. */
  maxBufferSize?: number;
  /** Which record to drop when the buffer is full. Default: `oldest`. */
  dropPolicy?: DropPolicy;
  /** Per-exporter retry policy on export failure. */
  retry?: RetryOptions;
  /**
   * Source of trace correlation stamped onto every record. Defaults to the
   * zero-dep ALS provider (W3C `traceparent`); pass an
   * `OtelTraceContextProvider` to read the active OpenTelemetry span.
   */
  traceContext?: TraceContextProvider;
}

/**
 * Options for {@link LoggingInterceptor}, the automatic HTTP request/response
 * logger.
 */
export interface LoggingInterceptorOptions {
  /** Level for successful requests. Default: `log`. */
  level?: LogLevel;
  /** Requests slower than this (ms) are logged at `warn`. Default: disabled. */
  slowThresholdMs?: number;
  /** Include the query string in the logged URL. Default: true. */
  includeQuery?: boolean;
  /** Include the `user-agent` header. Default: false. */
  includeUserAgent?: boolean;
  /** Include the client IP. Default: false. */
  includeIp?: boolean;
}

/**
 * Async configuration for {@link LoggerModule.forRootAsync}.
 */
export interface LoggerModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  isGlobal?: boolean;
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<LoggerModuleOptions> | LoggerModuleOptions;
}

/** @internal Resolved options with every field populated. */
export interface ResolvedLoggerOptions
  extends Required<Omit<LoggerModuleOptions, 'isGlobal' | 'batch' | 'retry'>> {
  batch: Required<BatchOptions>;
  retry: Required<RetryOptions>;
}

/** Convenience alias for a class reference in provider wiring. */
export type ClassRef = Type<unknown>;
