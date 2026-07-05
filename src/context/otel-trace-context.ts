import type { TraceContext, TraceContextProvider } from '../logger.interfaces';
import { getStore } from './als';
import { defaultTraceContextProvider } from './trace-context';
import { loadOptional } from '../exporters/optional-dep';

const INVALID_TRACE_ID = '00000000000000000000000000000000';

/**
 * Trace-context provider that reads the **active OpenTelemetry span**. When an
 * OTel SDK is running, every log is automatically stamped with the real
 * `trace_id`/`span_id` of the current span, so logs correlate with traces in
 * the same backend.
 *
 * Requires the optional peer dependency `@opentelemetry/api`. When no span is
 * active it falls back to the async store (W3C `traceparent` / ids generated
 * by {@link CorrelationMiddleware}), so a trace id still traverses every log.
 */
export class OtelTraceContextProvider implements TraceContextProvider {
  readonly name = 'opentelemetry';
  private api: any;

  async init(): Promise<void> {
    this.api = await loadOptional<any>(
      '@opentelemetry/api',
      'OtelTraceContextProvider',
    );
  }

  getContext(): TraceContext | undefined {
    const span = this.api?.trace?.getActiveSpan?.();
    const spanContext = span?.spanContext?.();

    if (!spanContext || spanContext.traceId === INVALID_TRACE_ID) {
      // No active span — fall back to the ALS store (correlation id + any
      // W3C/generated trace ids from the middleware).
      return defaultTraceContextProvider.getContext();
    }

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      // OTel exposes traceFlags as a number; the log data model wants 2-hex.
      traceFlags:
        typeof spanContext.traceFlags === 'number'
          ? spanContext.traceFlags.toString(16).padStart(2, '0')
          : undefined,
      correlationId: getStore()?.correlationId,
    };
  }
}
