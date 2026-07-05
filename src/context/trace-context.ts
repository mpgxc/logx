import type { TraceContext, TraceContextProvider } from '../logger.interfaces';
import { getStore } from './als';

/**
 * Default, zero-dependency trace-context provider. Reads the trace ids and
 * correlation id from the `AsyncLocalStorage` store populated by
 * {@link CorrelationMiddleware} (which honors the W3C `traceparent` header).
 *
 * This keeps a `trace_id` flowing through every log of a request even when
 * no OpenTelemetry SDK is installed.
 */
export class AlsTraceContextProvider implements TraceContextProvider {
  readonly name = 'als';

  getContext(): TraceContext | undefined {
    const store = getStore();
    if (!store) {
      return undefined;
    }

    return {
      traceId: store.traceId,
      spanId: store.spanId,
      traceFlags: store.traceFlags,
      correlationId: store.correlationId,
    };
  }
}

/** Shared default provider instance. */
export const defaultTraceContextProvider = new AlsTraceContextProvider();
