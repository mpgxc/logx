import { Provider } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { getLoggerToken } from './logger.utils';

/**
 * Creates a factory for a single token registered in the LoggerModule.
 */
const loggerFactory = (token: string) => (logger: LoggerService) => {
  logger.setContext(token);

  return logger;
};

/**
 * Creates a provider for a single token registered in the LoggerModule.
 */
const createLoggerProvider = (token: string): Provider<LoggerService> => ({
  inject: [LoggerService],
  provide: getLoggerToken(token),
  useFactory: loggerFactory(token),
});

/**
 * Creates providers for all tokens registered in the LoggerModule.
 */
export const createLoggerProviders = (
  tokens: string[],
): Array<Provider<LoggerService>> =>
  tokens.map((token) => createLoggerProvider(token));
