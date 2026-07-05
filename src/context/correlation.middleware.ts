import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CORRELATION_ID_HEADER } from '../logger.constants';
import { runWithStore } from './als';

type ReqLike = {
  headers: Record<string, string | string[] | undefined>;
};
type ResLike = {
  setHeader: (name: string, value: string) => void;
};

/**
 * Opens a per-request async store carrying a correlation id. If the
 * incoming request already has an `x-correlation-id` header it is reused;
 * otherwise a fresh UUID is generated. The id is echoed back on the
 * response and attached to every log emitted during the request.
 *
 * Register it in your `AppModule`:
 * ```ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(CorrelationMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: ReqLike, res: ResLike, next: () => void): void {
    const incoming = req.headers[CORRELATION_ID_HEADER];
    const correlationId =
      (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    runWithStore({ correlationId }, () => next());
  }
}
