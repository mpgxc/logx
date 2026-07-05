import { describe, expect, it } from 'vitest';
import { LOG_DISPATCHER, LOGGER_OPTIONS } from './logger.constants';
import { LoggerModule } from './logger.module';
import { LoggerService } from './logger.service';
import { getLoggerToken } from './logger.utils';
import type { ResolvedLoggerOptions } from './logger.interfaces';

const findProvider = (providers: any[], token: unknown) =>
  providers.find((p) => p && typeof p === 'object' && p.provide === token);

describe('LoggerModule', () => {
  it('forRoot resolves defaults and exports the public surface', () => {
    const mod = LoggerModule.forRoot({ isGlobal: true });

    expect(mod.global).toBe(true);
    const options = findProvider(mod.providers as any[], LOGGER_OPTIONS)
      .useValue as ResolvedLoggerOptions;
    expect(options.batch).toEqual({ size: 100, intervalMs: 2000 });
    expect(mod.exports).toContain(LoggerService);
    expect(mod.exports).toContain(LOG_DISPATCHER);
  });

  it('forRoot honors explicit options', () => {
    const mod = LoggerModule.forRoot({
      level: 'warn',
      json: true,
      redact: ['pw'],
      batch: { size: 5 },
    });
    const options = findProvider(mod.providers as any[], LOGGER_OPTIONS)
      .useValue as ResolvedLoggerOptions;

    expect(options.level).toBe('warn');
    expect(options.json).toBe(true);
    expect(options.redact).toEqual(['pw']);
    expect(options.batch.size).toBe(5);
  });

  it('forRootAsync wires a factory that resolves options', async () => {
    const mod = LoggerModule.forRootAsync({
      useFactory: () => ({ level: 'error' }),
    });
    const provider = findProvider(mod.providers as any[], LOGGER_OPTIONS);
    const resolved = (await provider.useFactory()) as ResolvedLoggerOptions;

    expect(resolved.level).toBe('error');
    expect(resolved.batch.intervalMs).toBe(2000);
  });

  it('forFeature registers one context-scoped provider per context', () => {
    const mod = LoggerModule.forFeature(['A', 'B']);
    const tokens = (mod.providers as any[]).map((p) => p.provide);

    expect(tokens).toContain(getLoggerToken('A'));
    expect(tokens).toContain(getLoggerToken('B'));
    expect(mod.exports).toHaveLength(2);
  });

  it('does not share state between two independent forRoot calls', () => {
    const a = LoggerModule.forRoot({ redact: ['a'] });
    const b = LoggerModule.forRoot({ redact: ['b'] });

    const optsA = findProvider(a.providers as any[], LOGGER_OPTIONS).useValue;
    const optsB = findProvider(b.providers as any[], LOGGER_OPTIONS).useValue;
    expect(optsA.redact).toEqual(['a']);
    expect(optsB.redact).toEqual(['b']);
  });
});
