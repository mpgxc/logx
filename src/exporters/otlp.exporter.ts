import { OTEL_SEVERITY_NUMBER } from '../logger.constants';
import type { LogExporter, LogRecord } from '../logger.interfaces';

export interface OtlpExporterOptions {
  /** Collector base URL. Default: `http://localhost:4318`. */
  endpoint?: string;
  /** Logs path appended to the endpoint. Default: `/v1/logs`. */
  path?: string;
  /** `service.name` resource attribute. Default: `nestjs`. */
  serviceName?: string;
  /** Extra headers (auth, tenant, …). */
  headers?: Record<string, string>;
  /** Per-request timeout in ms. Default: 5000. */
  timeoutMs?: number;
}

type AnyValue =
  | { stringValue: string }
  | { intValue: number }
  | { doubleValue: number }
  | { boolValue: boolean };

const toAnyValue = (value: unknown): AnyValue => {
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: value }
      : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  return { stringValue: JSON.stringify(value) };
};

const attr = (key: string, value: unknown) => ({
  key,
  value: toAnyValue(value),
});

/**
 * Ships records to an OpenTelemetry Collector via **OTLP/HTTP (JSON)**. Uses
 * the global `fetch`, so it needs no OpenTelemetry SDK — Collectors accept
 * OTLP/JSON on `/v1/logs` (port 4318 by default).
 *
 * Trace correlation is preserved: `trace_id`/`span_id` map to the OTLP log
 * record's `traceId`/`spanId`, letting the backend join logs to traces.
 */
export class OtlpExporter implements LogExporter {
  readonly name = 'otlp';

  private readonly url: string;
  private readonly serviceName: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: OtlpExporterOptions = {}) {
    const endpoint = (options.endpoint ?? 'http://localhost:4318').replace(
      /\/$/,
      '',
    );
    this.url = `${endpoint}${options.path ?? '/v1/logs'}`;
    this.serviceName = options.serviceName ?? 'nestjs';
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async export(records: LogRecord[]): Promise<void> {
    if (!records.length) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.headers },
        body: JSON.stringify(this.toPayload(records)),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OTLP ${response.status} ${response.statusText}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private toPayload(records: LogRecord[]) {
    return {
      resourceLogs: [
        {
          resource: {
            attributes: [attr('service.name', this.serviceName)],
          },
          scopeLogs: [
            {
              scope: { name: '@mpgxc/logx' },
              logRecords: records.map((r) => this.toLogRecord(r)),
            },
          ],
        },
      ],
    };
  }

  private toLogRecord(r: LogRecord) {
    const attributes = [
      r.context ? attr('context', r.context) : null,
      attr('pid', r.pid),
      r.correlationId ? attr('correlation_id', r.correlationId) : null,
      r.stack ? attr('exception.stacktrace', r.stack) : null,
      ...Object.entries(r.meta ?? {}).map(([k, v]) => attr(k, v)),
    ].filter(Boolean);

    return {
      // Nanoseconds since epoch, as a string to preserve precision.
      timeUnixNano: (BigInt(r.timestamp) * 1_000_000n).toString(),
      severityNumber: OTEL_SEVERITY_NUMBER[r.level] ?? 9,
      severityText: r.level,
      body: { stringValue: r.message },
      attributes,
      // OTLP/JSON encodes trace/span ids as hex strings.
      ...(r.trace_id ? { traceId: r.trace_id } : {}),
      ...(r.span_id ? { spanId: r.span_id } : {}),
    };
  }
}
