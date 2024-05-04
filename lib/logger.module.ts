import { DynamicModule, Provider } from '@nestjs/common';
import { createLoggerProviders } from './logger.providers';
import { LoggerService } from './logger.service';

type LoggerModuleOptions = {
  isGlobal?: boolean;
};

export class LoggerModule {
  public static tokensForLoggers = new Array<string>();

  static forRoot(options?: LoggerModuleOptions): DynamicModule {
    const prefixedLoggerProviders: Provider<LoggerService>[] =
      createLoggerProviders(this.tokensForLoggers);

    return {
      module: LoggerModule,
      providers: [LoggerService, ...prefixedLoggerProviders],
      exports: [LoggerService, ...prefixedLoggerProviders],
      global: Boolean(options?.isGlobal),
    };
  }
}
