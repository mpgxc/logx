import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request store propagated through the async call graph. The
 * correlation id (and any extra fields) set here are automatically
 * attached to every {@link LogRecord} produced while the store is active.
 */
export interface LogStore {
  correlationId?: string;
  /** W3C/OpenTelemetry trace id (32-char hex). */
  traceId?: string;
  /** OpenTelemetry span id (16-char hex). */
  spanId?: string;
  /** OpenTelemetry trace flags (2-char hex). */
  traceFlags?: string;
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<LogStore>();

/** Runs `fn` with `store` active for the duration of its async execution. */
export const runWithStore = <T>(store: LogStore, fn: () => T): T =>
  storage.run(store, fn);

/** Returns the active store, if any. */
export const getStore = (): LogStore | undefined => storage.getStore();

/** Returns the active correlation id, if any. */
export const getCorrelationId = (): string | undefined =>
  storage.getStore()?.correlationId;

/**
 * Merges fields into the active store. No-op when called outside a store.
 * Useful for enriching logs with request-scoped data (userId, tenant, …).
 */
export const setContext = (fields: Record<string, unknown>): void => {
  const store = storage.getStore();

  if (store) {
    Object.assign(store, fields);
  }
};
