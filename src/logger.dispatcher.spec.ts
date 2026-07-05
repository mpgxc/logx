import { describe, expect, it, vi } from 'vitest';
import { defaultTraceContextProvider } from './context/trace-context';
import { LogDispatcher } from './logger.dispatcher';
import type {
  LogExporter,
  LogRecord,
  ResolvedLoggerOptions,
} from './logger.interfaces';

const record = (over: Partial<LogRecord> = {}): LogRecord => ({
  level: 'log',
  message: 'hello',
  timestamp: 1,
  pid: 1,
  ...over,
});

const options = (
  exporters: LogExporter[],
  batch?: Partial<ResolvedLoggerOptions['batch']>,
): ResolvedLoggerOptions => ({
  level: 'log',
  json: true,
  colors: false,
  redact: [],
  exporters,
  batch: { size: batch?.size ?? 100, intervalMs: batch?.intervalMs ?? 2000 },
  traceContext: defaultTraceContextProvider,
});

const collector = (): LogExporter & { records: LogRecord[] } => {
  const records: LogRecord[] = [];
  return {
    name: 'collector',
    records,
    export: (batch) => {
      records.push(...batch);
    },
  };
};

describe('LogDispatcher', () => {
  it('flushes automatically when the batch size is reached', async () => {
    const sink = collector();
    const dispatcher = new LogDispatcher(options([sink], { size: 3 }));

    dispatcher.dispatch(record());
    dispatcher.dispatch(record());
    expect(sink.records).toHaveLength(0); // below threshold

    dispatcher.dispatch(record()); // hits size=3 → flush
    await Promise.resolve();

    expect(sink.records).toHaveLength(3);
  });

  it('flushes buffered records via the interval timer', async () => {
    vi.useFakeTimers();
    const sink = collector();
    const dispatcher = new LogDispatcher(
      options([sink], { size: 100, intervalMs: 500 }),
    );

    dispatcher.dispatch(record());
    expect(sink.records).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(500);
    expect(sink.records).toHaveLength(1);
    vi.useRealTimers();
  });

  it('isolates exporter failures — one bad exporter never affects the others', async () => {
    const good = collector();
    const bad: LogExporter = {
      name: 'bad',
      export: () => {
        throw new Error('boom');
      },
    };
    const dispatcher = new LogDispatcher(options([bad, good], { size: 1 }));

    expect(() => dispatcher.dispatch(record({ message: 'x' }))).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(good.records).toHaveLength(1);
    expect(good.records[0].message).toBe('x');
  });

  it('does nothing when there are no exporters', () => {
    const dispatcher = new LogDispatcher(options([]));
    expect(() => dispatcher.dispatch(record())).not.toThrow();
  });

  it('initializes and closes exporters through the lifecycle hooks', async () => {
    const init = vi.fn();
    const close = vi.fn();
    const flush = vi.fn();
    const sink: LogExporter = {
      name: 'lifecycle',
      init,
      close,
      flush,
      export: vi.fn(),
    };
    const dispatcher = new LogDispatcher(options([sink]));

    await dispatcher.onModuleInit();
    expect(init).toHaveBeenCalledOnce();
    expect(dispatcher.isReady).toBe(true);

    await dispatcher.onApplicationShutdown();
    expect(flush).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('drains remaining buffered records on shutdown', async () => {
    const sink = collector();
    const dispatcher = new LogDispatcher(options([sink], { size: 100 }));

    dispatcher.dispatch(record());
    dispatcher.dispatch(record());
    expect(sink.records).toHaveLength(0);

    await dispatcher.onApplicationShutdown();
    expect(sink.records).toHaveLength(2);
  });

  it('redacts sensitive keys before exporting', async () => {
    const sink = collector();
    const opts = options([sink], { size: 1 });
    opts.redact = ['password'];
    const dispatcher = new LogDispatcher(opts);

    dispatcher.dispatch(record({ meta: { password: 'hunter2', user: 'ana' } }));
    await Promise.resolve();

    expect(sink.records[0].meta).toEqual({
      password: '[REDACTED]',
      user: 'ana',
    });
  });
});
