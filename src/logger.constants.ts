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
