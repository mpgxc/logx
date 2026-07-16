import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor';
import type { LoggerService } from '../logger.service';
import type { LoggingInterceptorOptions } from '../logger.interfaces';

const makeLogger = () => {
  const calls: { level: string; message: string; meta?: unknown }[] = [];
  const record = (level: string) => (message: string, meta?: unknown) =>
    calls.push({ level, message, meta });
  const logger = {
    setContext: vi.fn(),
    log: record('log'),
    warn: record('warn'),
    error: record('error'),
  } as unknown as LoggerService;
  return { logger, calls };
};

const httpContext = (
  req: Record<string, unknown>,
  res: Record<string, unknown>,
  type = 'http',
): ExecutionContext =>
  ({
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  }) as unknown as ExecutionContext;

const handler = (obs: unknown): CallHandler =>
  ({ handle: () => obs }) as unknown as CallHandler;

const build = (opts?: LoggingInterceptorOptions) => {
  const { logger, calls } = makeLogger();
  return { interceptor: new LoggingInterceptor(logger, opts), calls, logger };
};

describe('LoggingInterceptor', () => {
  it('sets the HTTP context on construction', () => {
    const { logger } = build();
    expect(logger.setContext).toHaveBeenCalledWith('HTTP');
  });

  it('logs method, url, status and duration on success', async () => {
    const { interceptor, calls } = build();
    const ctx = httpContext(
      { method: 'GET', originalUrl: '/users?q=1' },
      { statusCode: 200 },
    );

    await lastValueFrom(interceptor.intercept(ctx, handler(of('ok'))));

    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe('log');
    expect(calls[0].message).toBe('GET /users?q=1');
    expect(calls[0].meta).toMatchObject({
      method: 'GET',
      url: '/users?q=1',
      statusCode: 200,
    });
    expect((calls[0].meta as any).durationMs).toBeTypeOf('number');
  });

  it('strips the query string when includeQuery is false', async () => {
    const { interceptor, calls } = build({ includeQuery: false });
    const ctx = httpContext(
      { method: 'GET', originalUrl: '/users?q=1' },
      { statusCode: 200 },
    );

    await lastValueFrom(interceptor.intercept(ctx, handler(of('ok'))));
    expect(calls[0].message).toBe('GET /users');
  });

  it('escalates to warn past the slow threshold', async () => {
    const { interceptor, calls } = build({ slowThresholdMs: 1 });
    const ctx = httpContext(
      { method: 'GET', url: '/slow' },
      { statusCode: 200 },
    );

    // Real ~5ms delay reliably exceeds the 1ms threshold.
    await lastValueFrom(
      interceptor.intercept(ctx, handler(of('ok').pipe(delay(5)))),
    );
    expect(calls[0].level).toBe('warn');
  });

  it('logs at error level and rethrows on failure', async () => {
    const { interceptor, calls } = build();
    const ctx = httpContext({ method: 'POST', url: '/pay' }, {});
    const err = Object.assign(new Error('boom'), { status: 418 });

    await expect(
      lastValueFrom(interceptor.intercept(ctx, handler(throwError(() => err)))),
    ).rejects.toThrow('boom');

    expect(calls[0].level).toBe('error');
    expect(calls[0].meta).toMatchObject({ statusCode: 418, error: 'boom' });
  });

  it('passes non-http contexts through without logging', async () => {
    const { interceptor, calls } = build();
    const ctx = httpContext({}, {}, 'rpc');

    await lastValueFrom(interceptor.intercept(ctx, handler(of('ok'))));
    expect(calls).toHaveLength(0);
  });
});
