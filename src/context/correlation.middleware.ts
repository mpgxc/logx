import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CORRELATION_ID_HEADER, TRACEPARENT_HEADER } from '../logger.constants';
import {
  generateSpanId,
  generateTraceId,
  parseTraceparent,
} from '../logger.utils';
import { runWithStore } from './als';

type ReqLike = {
  headers: Record<string, string | string[] | undefined>;
};
type ResLike = {
  setHeader: (name: string, value: string) => void;
};

const header = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Opens a per-request async store carrying trace correlation.
 *
 * - Honors the W3C `traceparent` header when present, so a `trace_id` /
 *   `span_id` propagated from an upstream service flows through every log.
 * - When absent, generates a fresh `trace_id`/`span_id` — guaranteeing that a
 *   trace id traverses **all** logs of the request even without any tracing SDK.
 * - Reuses/echoes `x-correlation-id` for human-friendly correlation.
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
    const parent = parseTraceparent(header(req.headers[TRACEPARENT_HEADER]));

    const traceId = parent?.traceId ?? generateTraceId();
    const spanId = parent?.spanId ?? generateSpanId();
    const traceFlags = parent?.traceFlags ?? '01';

    const correlationId =
      header(req.headers[CORRELATION_ID_HEADER]) || randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    runWithStore({ correlationId, traceId, spanId, traceFlags }, () => next());
  }
}

/** Alias — the middleware also establishes tracing, not just correlation. */
export { CorrelationMiddleware as TracingMiddleware };
