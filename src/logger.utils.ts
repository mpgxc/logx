import { DEFAULT_REDACT_KEYS, LEVEL_RANK } from './logger.constants';
import type { LogLevel, LogRecord } from './logger.interfaces';

/**
 * Builds the DI token used to inject a context-scoped logger.
 *
 * @param context The context prepended to every message. Empty for the root logger.
 */
export const getLoggerToken = (context = ''): string =>
  `LoggerService:${context}`;

/**
 * Returns the enabled log levels for a minimum level, honoring NestJS'
 * cascading semantics (choosing `warn` enables `warn`, `error`, `fatal`).
 */
export const levelsFrom = (min: LogLevel): LogLevel[] => {
  const floor = LEVEL_RANK[min];

  return (Object.keys(LEVEL_RANK) as LogLevel[]).filter(
    (level) => LEVEL_RANK[level] >= floor,
  );
};

/**
 * Recursively removes sensitive keys from a value, returning a copy.
 * Redacted values are replaced with the string `'[REDACTED]'`. Guards
 * against circular references.
 */
export const redact = <T>(
  value: T,
  keys: string[],
  seen = new WeakSet(),
): T => {
  if (!keys.length || value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);

  const lowered = new Set(keys.map((k) => k.toLowerCase()));

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, keys, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = lowered.has(key.toLowerCase())
      ? '[REDACTED]'
      : redact(val, keys, seen);
  }

  return out as T;
};

/**
 * Applies redaction to a record's `meta` in place, using the configured
 * keys (falling back to {@link DEFAULT_REDACT_KEYS} when the list is empty).
 */
export const redactRecord = (record: LogRecord, keys: string[]): LogRecord => {
  if (!record.meta) {
    return record;
  }

  const effective = keys.length ? keys : DEFAULT_REDACT_KEYS;
  record.meta = redact(record.meta, effective);

  return record;
};
