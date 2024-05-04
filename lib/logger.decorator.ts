import { Inject, Logger } from '@nestjs/common';
import { LoggerModule } from './logger.module';
import { getLoggerToken } from './logger.utils';

/**
 * Injects a `LoggerService`
 *
 * @param token Token which gets prepended before every log message
 */
export const LoggerInject = (token: string = '') => {
  const tokenAlreadyUsed =
    `LoggerInject('${token}') is already used. ` +
    `Please use another token or use LoggerInject('${token}_1') instead.`;

  if (LoggerModule.tokensForLoggers.includes(token)) {
    Logger.error(tokenAlreadyUsed, 'LoggerModule');

    throw new Error(tokenAlreadyUsed);
  }

  LoggerModule.tokensForLoggers.push(token);

  return Inject(getLoggerToken(token));
};
