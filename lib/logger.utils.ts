/**
 * Creates the token for a logger with a token
 * @param token The token of the logger
 */
export const getLoggerToken = (token: string = ''): string =>
  `LoggerService:${token}`;
