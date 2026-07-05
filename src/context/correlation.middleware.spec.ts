import { describe, expect, it, vi } from 'vitest';
import {
  CorrelationMiddleware,
  TracingMiddleware,
} from './correlation.middleware';
import { getStore, type LogStore } from './als';

const run = (headers: Record<string, string> = {}) => {
  const mw = new CorrelationMiddleware();
  const res = { setHeader: vi.fn() };
  let store: LogStore | undefined;
  mw.use({ headers }, res, () => {
    store = getStore();
  });
  return { store: store!, res };
};

describe('CorrelationMiddleware', () => {
  it('reuses an incoming W3C traceparent', () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const spanId = '00f067aa0ba902b7';
    const { store } = run({ traceparent: `00-${traceId}-${spanId}-01` });

    expect(store.traceId).toBe(traceId);
    expect(store.spanId).toBe(spanId);
    expect(store.traceFlags).toBe('01');
  });

  it('generates a trace id when no traceparent is present', () => {
    const { store } = run();

    expect(store.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(store.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(store.correlationId).toBeTruthy();
  });

  it('reuses and echoes x-correlation-id', () => {
    const { store, res } = run({ 'x-correlation-id': 'abc-123' });

    expect(store.correlationId).toBe('abc-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'abc-123');
  });

  it('exposes a TracingMiddleware alias', () => {
    expect(TracingMiddleware).toBe(CorrelationMiddleware);
  });
});
