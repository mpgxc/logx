/**
 * Dependency-injection token carrying the resolved module options.
 * @internal
 */
export const LOGGER_OPTIONS = Symbol('logx:options');

/**
 * Dependency-injection token for the singleton {@link LogDispatcher}.
 * @internal
 */
export const LOG_DISPATCHER = Symbol('logx:dispatcher');

/**
 * Optional DI token carrying {@link LoggingInterceptorOptions}.
 * @internal
 */
export const LOGGING_OPTIONS = Symbol('logx:logging-options');

/**
 * Default numeric ordering for cascading level filtering.
 * A record is emitted when its rank is `>=` the configured level's rank.
 * @internal
 */
export const LEVEL_RANK: Record<string, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/** Default keys redacted from `meta` when none are configured. */
export const DEFAULT_REDACT_KEYS = [
  'password',
  'authorization',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
];

/** Header used by the correlation middleware. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** W3C Trace Context header carrying `version-traceId-spanId-flags`. */
export const TRACEPARENT_HEADER = 'traceparent';

/**
 * Maps our log levels to the OpenTelemetry `SeverityNumber` enum used by the
 * OTLP log data model.
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 * @internal
 */
export const OTEL_SEVERITY_NUMBER: Record<string, number> = {
  verbose: 1, // TRACE
  debug: 5, // DEBUG
  log: 9, // INFO
  warn: 13, // WARN
  error: 17, // ERROR
  fatal: 21, // FATAL
};
