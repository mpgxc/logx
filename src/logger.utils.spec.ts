import { describe, expect, it } from 'vitest';
import {
  getLoggerToken,
  levelsFrom,
  redact,
  redactRecord,
} from './logger.utils';
import type { LogRecord } from './logger.interfaces';

describe('getLoggerToken', () => {
  it('builds a stable, context-scoped token', () => {
    expect(getLoggerToken('Payments')).toBe('LoggerService:Payments');
    expect(getLoggerToken()).toBe('LoggerService:');
  });
});

describe('levelsFrom', () => {
  it('returns cascading levels from the given floor', () => {
    expect(levelsFrom('warn')).toEqual(['warn', 'error', 'fatal']);
    expect(levelsFrom('verbose')).toHaveLength(6);
  });
});

describe('redact', () => {
  it('replaces sensitive keys case-insensitively and deeply', () => {
    const out = redact({ Password: 'x', nested: { token: 'y', keep: 1 } }, [
      'password',
      'token',
    ]);
    expect(out).toEqual({
      Password: '[REDACTED]',
      nested: { token: '[REDACTED]', keep: 1 },
    });
  });

  it('handles arrays and circular references without throwing', () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    expect(() => redact(circular, ['secret'])).not.toThrow();

    const arr = redact([{ secret: 1 }, { ok: 2 }], ['secret']);
    expect(arr).toEqual([{ secret: '[REDACTED]' }, { ok: 2 }]);
  });

  it('is a no-op with an empty key list', () => {
    const value = { password: 'x' };
    expect(redact(value, [])).toEqual(value);
  });
});

describe('redactRecord', () => {
  it('falls back to default keys when none are configured', () => {
    const rec: LogRecord = {
      level: 'log',
      message: 'm',
      timestamp: 1,
      pid: 1,
      meta: { password: 'p', ok: 1 },
    };
    redactRecord(rec, []);
    expect(rec.meta).toEqual({ password: '[REDACTED]', ok: 1 });
  });
});
