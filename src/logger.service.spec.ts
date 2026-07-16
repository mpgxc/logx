import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithStore } from './context/als';
import { defaultTraceContextProvider } from './context/trace-context';
import { LogDispatcher } from './logger.dispatcher';
import { LoggerService } from './logger.service';
import type { LogRecord, ResolvedLoggerOptions } from './logger.interfaces';

const opts: ResolvedLoggerOptions = {
  level: 'verbose',
  json: false,
  colors: false,
  redact: [],
  exporters: [],
  batch: { size: 100, intervalMs: 2000 },
  maxBufferSize: 10_000,
  dropPolicy: 'oldest',
  retry: { attempts: 3, backoffMs: 200, maxBackoffMs: 5000 },
  traceContext: defaultTraceContextProvider,
};

const makeService = () => {
  const captured: LogRecord[] = [];
  const dispatcher = {
    dispatch: (r: LogRecord) => captured.push(r),
  } as unknown as LogDispatcher;
  const service = new LoggerService('Payments', dispatcher, opts);
  return { service, captured };
};

describe('LoggerService', () => {
  beforeEach(() => {
    // Keep stdout clean; native printing is exercised, output suppressed.
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  it('uses the explicit context and mirrors messages to the dispatcher', () => {
    const { service, captured } = makeService();

    service.log('order placed');

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      level: 'log',
      message: 'order placed',
      context: 'Payments',
    });
    expect(captured[0].pid).toBe(process.pid);
    expect(captured[0].timestamp).toBeTypeOf('number');
  });

  it('captures error stacks and the error level', () => {
    const { service, captured } = makeService();

    const stack = 'Error: kaboom\n    at Object.<anonymous> (/app/x.ts:10:15)';
    service.error('kaboom', stack);

    expect(captured[0].level).toBe('error');
    expect(captured[0].message).toBe('kaboom');
    expect(captured[0].stack).toContain('/app/x.ts:10:15');
  });

  it('merges object arguments into structured meta', () => {
    const { service, captured } = makeService();

    service.log('user login', { userId: 42, ip: '127.0.0.1' });

    expect(captured[0].message).toBe('user login');
    expect(captured[0].meta).toMatchObject({ userId: 42, ip: '127.0.0.1' });
  });

  it('attaches the correlation id from the async store', () => {
    const { service, captured } = makeService();

    runWithStore({ correlationId: 'abc-123', tenant: 'acme' }, () => {
      service.log('scoped');
    });

    expect(captured[0].correlationId).toBe('abc-123');
    expect(captured[0].meta).toMatchObject({ tenant: 'acme' });
  });

  it('stamps snake_case trace fields and keeps them out of meta', () => {
    const { service, captured } = makeService();

    runWithStore(
      {
        correlationId: 'c1',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        traceFlags: '01',
        tenant: 'acme',
      },
      () => service.log('traced'),
    );

    const r = captured[0];
    expect(r.trace_id).toBe('a'.repeat(32));
    expect(r.span_id).toBe('b'.repeat(16));
    expect(r.trace_flags).toBe('01');
    expect(r.correlationId).toBe('c1');
    expect(r.meta).toEqual({ tenant: 'acme' }); // trace keys excluded from meta
  });

  it('derives "Application" as the fallback context', () => {
    const captured: LogRecord[] = [];
    const dispatcher = {
      dispatch: (r: LogRecord) => captured.push(r),
    } as unknown as LogDispatcher;
    const service = new LoggerService(undefined, dispatcher, opts);

    service.log('anonymous');

    expect(captured[0].context).toBe('Application');
  });
});
