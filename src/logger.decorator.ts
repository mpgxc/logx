import { Inject } from '@nestjs/common';
import { getLoggerToken } from './logger.utils';

/**
 * Injects a context-scoped {@link LoggerService}.
 *
 * The context must have been registered via `LoggerModule.forFeature([...])`.
 * Unlike the v1 `LoggerInject`, this decorator holds **no global state** and
 * never throws on duplicate use — several classes can share the same context.
 *
 * ```ts
 * constructor(@InjectLogger('Payments') private readonly logger: LoggerService) {}
 * ```
 *
 * For most cases you can skip this entirely: injecting `LoggerService`
 * directly derives the context from the surrounding class automatically.
 *
 * @param context Prefix prepended to every message from this logger.
 */
export const InjectLogger = (context = ''): ParameterDecorator =>
  Inject(getLoggerToken(context));
