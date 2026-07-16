import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Optional,
} from '@nestjs/common';
import { type Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { LOGGING_OPTIONS } from '../logger.constants';
import type { LoggingInterceptorOptions, LogLevel } from '../logger.interfaces';
import { LoggerService } from '../logger.service';

type ReqLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type ResLike = { statusCode?: number };

/**
 * Logs one line per HTTP request with method, path, status code and latency,
 * automatically stamped with the active `trace_id` / `correlationId` (when
 * {@link CorrelationMiddleware} is registered).
 *
 * Register it globally:
 * ```ts
 * import { APP_INTERCEPTOR } from '@nestjs/core';
 *
 * @Module({
 *   providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
 * })
 * export class AppModule {}
 * ```
 *
 * Non-HTTP execution contexts (RPC, WebSocket) pass through untouched.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly options: Required<LoggingInterceptorOptions>;

  constructor(
    @Inject(LoggerService)
    private readonly logger: LoggerService,
    @Optional()
    @Inject(LOGGING_OPTIONS)
    options?: LoggingInterceptorOptions,
  ) {
    this.logger.setContext('HTTP');
    this.options = {
      level: options?.level ?? 'log',
      slowThresholdMs: options?.slowThresholdMs ?? 0,
      includeQuery: options?.includeQuery ?? true,
      includeUserAgent: options?.includeUserAgent ?? false,
      includeIp: options?.includeIp ?? false,
    };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<ReqLike>();
    const res = http.getResponse<ResLike>();

    const method = req.method ?? 'UNKNOWN';
    const url = this.resolveUrl(req);
    const start = process.hrtime.bigint();

    const meta = (statusCode: number): Record<string, unknown> => {
      const data: Record<string, unknown> = {
        method,
        url,
        statusCode,
        durationMs: this.elapsedMs(start),
      };
      if (this.options.includeIp && req.ip) {
        data.ip = req.ip;
      }
      if (this.options.includeUserAgent) {
        const ua = req.headers?.['user-agent'];
        if (ua) {
          data.userAgent = Array.isArray(ua) ? ua[0] : ua;
        }
      }
      return data;
    };

    return next.handle().pipe(
      tap(() => {
        const data = meta(res.statusCode ?? 200);
        const slow =
          this.options.slowThresholdMs > 0 &&
          (data.durationMs as number) > this.options.slowThresholdMs;
        const level: LogLevel = slow ? 'warn' : this.options.level;
        // Object arg → structured `meta` on the record (deterministic).
        this.logger[level](`${method} ${url}`, data);
      }),
      catchError((err) => {
        const status =
          (err?.status as number) ?? (err?.statusCode as number) ?? 500;
        const data = meta(status);
        data.error = err?.message ?? String(err);
        if (err?.stack) {
          data.stack = err.stack;
        }
        this.logger.error(`${method} ${url}`, data);
        return throwError(() => err);
      }),
    );
  }

  private resolveUrl(req: ReqLike): string {
    const raw = req.originalUrl ?? req.url ?? '';
    if (this.options.includeQuery) {
      return raw;
    }
    const q = raw.indexOf('?');
    return q === -1 ? raw : raw.slice(0, q);
  }

  private elapsedMs(start: bigint): number {
    const ns = Number(process.hrtime.bigint() - start);
    return Math.round((ns / 1e6) * 100) / 100; // 2 decimal places
  }
}
