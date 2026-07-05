import { describe, expect, it } from 'vitest';
import { runWithStore } from './als';
import {
  AlsTraceContextProvider,
  defaultTraceContextProvider,
} from './trace-context';
import {
  generateSpanId,
  generateTraceId,
  parseTraceparent,
} from '../logger.utils';

describe('trace id generation', () => {
  it('generates 32-hex trace ids and 16-hex span ids', () => {
    expect(generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
    expect(generateTraceId()).not.toBe(generateTraceId());
  });
});

describe('parseTraceparent', () => {
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const spanId = '00f067aa0ba902b7';

  it('parses a valid W3C traceparent', () => {
    expect(parseTraceparent(`00-${traceId}-${spanId}-01`)).toEqual({
      traceId,
      spanId,
      traceFlags: '01',
    });
  });

  it('rejects malformed or all-zero values', () => {
    expect(parseTraceparent(undefined)).toBeUndefined();
    expect(parseTraceparent('garbage')).toBeUndefined();
    expect(
      parseTraceparent(`00-${'0'.repeat(32)}-${spanId}-01`),
    ).toBeUndefined();
  });
});

describe('AlsTraceContextProvider', () => {
  const provider = new AlsTraceContextProvider();

  it('reads trace fields from the active store', () => {
    runWithStore(
      { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), correlationId: 'c1' },
      () => {
        expect(provider.getContext()).toEqual({
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          traceFlags: undefined,
          correlationId: 'c1',
        });
      },
    );
  });

  it('returns undefined outside any store', () => {
    expect(provider.getContext()).toBeUndefined();
    expect(defaultTraceContextProvider.name).toBe('als');
  });
});
