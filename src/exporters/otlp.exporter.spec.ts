import { afterEach, describe, expect, it, vi } from 'vitest';
import { OtlpExporter } from './otlp.exporter';
import type { LogRecord } from '../logger.interfaces';

const rec = (over: Partial<LogRecord> = {}): LogRecord => ({
  level: 'log',
  message: 'hello',
  context: 'Api',
  timestamp: 1700000000000,
  pid: 1,
  ...over,
});

describe('OtlpExporter', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        ({ ok: true, status: 200, statusText: 'OK' }) as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('posts an OTLP/JSON payload to /v1/logs by default', async () => {
    const fetchMock = stubFetch();
    const exporter = new OtlpExporter({ serviceName: 'demo' });

    await exporter.export([rec({ level: 'error', message: 'boom' })]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4318/v1/logs');

    const body = JSON.parse(init.body as string);
    const resource = body.resourceLogs[0];
    expect(resource.resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'demo' },
    });

    const otlp = resource.scopeLogs[0].logRecords[0];
    expect(otlp.severityNumber).toBe(17); // error → ERROR
    expect(otlp.severityText).toBe('error');
    expect(otlp.body).toEqual({ stringValue: 'boom' });
    // nanoseconds = ms * 1e6, as a string
    expect(otlp.timeUnixNano).toBe('1700000000000000000');
  });

  it('maps trace_id/span_id onto the OTLP record for correlation', async () => {
    const fetchMock = stubFetch();
    const exporter = new OtlpExporter();

    await exporter.export([
      rec({ trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) }),
    ]);

    const otlp = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      .resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(otlp.traceId).toBe('a'.repeat(32));
    expect(otlp.spanId).toBe('b'.repeat(16));
  });

  it('flattens meta into typed OTLP attributes', async () => {
    const fetchMock = stubFetch();
    const exporter = new OtlpExporter();

    await exporter.export([rec({ meta: { userId: 42, active: true } })]);

    const attrs = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      .resourceLogs[0].scopeLogs[0].logRecords[0].attributes;
    expect(attrs).toContainEqual({ key: 'userId', value: { intValue: 42 } });
    expect(attrs).toContainEqual({ key: 'active', value: { boolValue: true } });
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
      })),
    );
    await expect(new OtlpExporter().export([rec()])).rejects.toThrow(
      'OTLP 503',
    );
  });
});
