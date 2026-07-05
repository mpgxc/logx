import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpExporter } from './http.exporter';
import type { LogRecord } from '../logger.interfaces';

const rec = (over: Partial<LogRecord> = {}): LogRecord => ({
  level: 'log',
  message: 'hi',
  context: 'Test',
  timestamp: 1700000000000,
  pid: 1,
  ...over,
});

describe('HttpExporter', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        ({ ok: true, status: 200, statusText: 'OK' }) as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('posts a JSON envelope by default', async () => {
    const fetchMock = stubFetch();
    const exporter = new HttpExporter({ url: 'http://x/logs' });

    await exporter.export([rec(), rec({ message: 'bye' })]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/logs');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).logs).toHaveLength(2);
  });

  it('serializes into the Grafana Loki push format', async () => {
    const fetchMock = stubFetch();
    const exporter = new HttpExporter({
      url: 'http://loki/push',
      format: 'loki',
      labels: { app: 'demo' },
    });

    await exporter.export([rec(), rec({ level: 'error', message: 'oops' })]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.streams).toHaveLength(2); // grouped by (level, context)
    const stream = body.streams[0];
    expect(stream.stream.app).toBe('demo');
    // Loki timestamps are nanosecond strings.
    expect(stream.values[0][0]).toBe(String(1700000000000 * 1_000_000));
  });

  it('throws on a non-2xx response so the dispatcher can log it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Err' })),
    );
    const exporter = new HttpExporter({ url: 'http://x' });

    await expect(exporter.export([rec()])).rejects.toThrow('HTTP 500');
  });
});
