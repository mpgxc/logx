import type { DynamicModule, Provider } from '@nestjs/common';
import { defaultTraceContextProvider } from './context/trace-context';
import { LOG_DISPATCHER, LOGGER_OPTIONS } from './logger.constants';
import { LogDispatcher } from './logger.dispatcher';
import type {
  LoggerModuleAsyncOptions,
  LoggerModuleOptions,
  ResolvedLoggerOptions,
} from './logger.interfaces';
import { LoggerService } from './logger.service';
import { getLoggerToken } from './logger.utils';

const isDev = (): boolean =>
  (process.env.NODE_ENV ?? 'development') === 'development';

/** Fills every option with a sensible, environment-aware default. */
const resolveOptions = (
  options: LoggerModuleOptions = {},
): ResolvedLoggerOptions => ({
  level: options.level ?? (isDev() ? 'debug' : 'log'),
  json: options.json ?? !isDev(),
  colors: options.colors ?? isDev(),
  redact: options.redact ?? [],
  exporters: options.exporters ?? [],
  batch: {
    size: options.batch?.size ?? 100,
    intervalMs: options.batch?.intervalMs ?? 2000,
  },
  traceContext: options.traceContext ?? defaultTraceContextProvider,
});

const coreProviders: Provider[] = [
  { provide: LOG_DISPATCHER, useClass: LogDispatcher },
  LogDispatcher,
  LoggerService,
];

/**
 * A NestJS logging module with pluggable exporters.
 *
 * ```ts
 * LoggerModule.forRoot({
 *   isGlobal: true,
 *   json: true,
 *   redact: ['password', 'authorization'],
 *   exporters: [new FileExporter({ path: 'logs/app.log' })],
 * });
 * ```
 */
export class LoggerModule {
  /** Registers the logger synchronously. */
  static forRoot(options: LoggerModuleOptions = {}): DynamicModule {
    const optionsProvider: Provider = {
      provide: LOGGER_OPTIONS,
      useValue: resolveOptions(options),
    };

    return {
      module: LoggerModule,
      global: Boolean(options.isGlobal),
      providers: [optionsProvider, ...coreProviders],
      exports: [LOGGER_OPTIONS, LOG_DISPATCHER, LoggerService],
    };
  }

  /** Registers the logger with asynchronously-resolved options. */
  static forRootAsync(options: LoggerModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: LOGGER_OPTIONS,
      useFactory: async (...args: any[]) =>
        resolveOptions(await options.useFactory(...args)),
      inject: options.inject ?? [],
    };

    return {
      module: LoggerModule,
      global: Boolean(options.isGlobal),
      imports: options.imports ?? [],
      providers: [optionsProvider, ...coreProviders],
      exports: [LOGGER_OPTIONS, LOG_DISPATCHER, LoggerService],
    };
  }

  /**
   * Registers explicit, named context loggers, injectable via
   * `@InjectLogger('<context>')`. Requires {@link LoggerModule.forRoot}
   * (ideally with `isGlobal: true`) to be registered.
   */
  static forFeature(contexts: string[]): DynamicModule {
    const providers: Provider[] = contexts.map((context) => ({
      provide: getLoggerToken(context),
      inject: [LOG_DISPATCHER, LOGGER_OPTIONS],
      useFactory: (dispatcher: LogDispatcher, opts: ResolvedLoggerOptions) =>
        new LoggerService(context, dispatcher, opts),
    }));

    return {
      module: LoggerModule,
      providers,
      exports: providers,
    };
  }
}
