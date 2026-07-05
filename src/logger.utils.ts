import { randomBytes } from 'node:crypto';
import { DEFAULT_REDACT_KEYS, LEVEL_RANK } from './logger.constants';
import type { LogLevel, LogRecord, TraceContext } from './logger.interfaces';

/**
 * Builds the DI token used to inject a context-scoped logger.
 *
 * @param context The context prepended to every message. Empty for the root logger.
 */
export const getLoggerToken = (context = ''): string =>
  `LoggerService:${context}`;

/** Generates a random W3C/OpenTelemetry trace id (16 bytes → 32 hex chars). */
export const generateTraceId = (): string => randomBytes(16).toString('hex');

/** Generates a random W3C/OpenTelemetry span id (8 bytes → 16 hex chars). */
export const generateSpanId = (): string => randomBytes(8).toString('hex');

const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * Parses a W3C `traceparent` header value into a {@link TraceContext}.
 * Returns `undefined` for malformed values or the all-zero (invalid) trace id.
 *
 * @see https://www.w3.org/TR/trace-context/#traceparent-header
 */
export const parseTraceparent = (
  value: string | undefined,
): TraceContext | undefined => {
  if (!value) {
    return undefined;
  }

  const match = TRACEPARENT_RE.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const [, , traceId, spanId, traceFlags] = match;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) {
    return undefined;
  }

  return { traceId, spanId, traceFlags };
};

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
  seen: WeakSet<object> = new WeakSet(),
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
