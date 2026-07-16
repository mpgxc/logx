[![Publish package](https://github.com/mpgxc/logx/actions/workflows/publish.yml/badge.svg)](https://github.com/mpgxc/logx/actions/workflows/publish.yml)

# @mpgxc/logx

A structured logging library for **NestJS 11+** with pluggable **exporters**.

Drop-in replacement for the built-in logger that keeps 100% of the native
behavior (including NestJS 11's structured-JSON output) and adds a clean
**adapter pattern** to ship logs anywhere: files, HTTP endpoints
(Grafana Loki / Datadog / Elastic), Postgres, MongoDB, DynamoDB and CloudWatch.

## Why

- 🧩 **Exporters as adapters** — send the same log stream to many destinations.
- 🪶 **Zero-bloat core** — heavy SDKs (`pg`, `mongodb`, `aws-sdk`) are
  **optional peer dependencies**, loaded on demand only when used.
- 🧵 **Correlation & tracing** — a `trace_id`/`span_id` traverses every log via
  `AsyncLocalStorage`; **OpenTelemetry-friendly** and pluggable (W3C `traceparent`
  by default, active OTel span when the SDK is present) + an OTLP log exporter.
- 🔒 **Redaction** — strip secrets (`password`, `authorization`, …) before export.
- 🛡️ **Failure isolation** — a broken exporter never crashes your app or the others.
- 🎯 **Auto-context** — the logger derives its context from the injecting class,
  with **no global state** (the v1 static token registry is gone).
- 📦 **Batching** — records are buffered and flushed by size/interval.

## Install

```bash
npm install @mpgxc/logx
```

Install only the exporters you actually use:

```bash
npm install pg                                   # PgExporter
npm install mongodb                              # MongoExporter
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb   # DynamoDBExporter
npm install @aws-sdk/client-cloudwatch-logs      # CloudWatchExporter
npm install @opentelemetry/api                   # OtelTraceContextProvider
# File, Http, Console and OTLP exporters have no extra dependencies.
```

## Quickstart

```ts
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { LoggerModule, LoggerService, FileExporter, HttpExporter } from '@mpgxc/logx';

@Module({
  imports: [
    LoggerModule.forRoot({
      isGlobal: true,
      json: true, // native NestJS 11 structured output on stdout
      redact: ['password', 'authorization'],
      exporters: [
        new FileExporter({ path: 'logs/app.log' }),
        new HttpExporter({ url: 'http://loki:3100/loki/api/v1/push', format: 'loki' }),
      ],
    }),
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(LoggerService)); // route Nest's own logs through logx
  app.enableShutdownHooks();             // flush exporters on shutdown
  await app.listen(3000);
}
bootstrap();
```

## Using the logger

The context is inferred from the surrounding class automatically — just inject:

```ts
@Injectable()
export class OrdersService {
  constructor(private readonly logger: LoggerService) {} // context = "OrdersService"

  create() {
    this.logger.log('order created', { orderId: 7 }); // object args → structured meta
    this.logger.error('payment failed', error.stack);
  }
}
```

Need an explicit, shared context across classes? Register it with `forFeature`:

```ts
@Module({ imports: [LoggerModule.forFeature(['Billing'])] })
export class BillingModule {}

@Injectable()
export class BillingService {
  constructor(@InjectLogger('Billing') private readonly logger: LoggerService) {}
}
```

> `forFeature` requires `LoggerModule.forRoot({ isGlobal: true })` to be registered.

## Correlation & OpenTelemetry tracing

Register the middleware to open a per-request async context. Every log emitted
during the request is automatically stamped with a **`trace_id`**, **`span_id`**
and **`correlationId`** — so a single id traverses *all* logs of a request.

```ts
import { CorrelationMiddleware, setContext } from '@mpgxc/logx';

@Module({ /* … */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}

// Enrich the active request context anywhere downstream:
setContext({ userId, tenant });
```

The middleware honors the **W3C `traceparent`** header when present (so ids
propagated from an upstream service flow through), and generates fresh ids
otherwise. It echoes `x-correlation-id` back on the response.

Every record carries the trace fields in **snake_case** (`trace_id`, `span_id`,
`trace_flags`) — the OpenTelemetry/ECS log convention — so **Grafana Loki,
Datadog and Elastic auto-correlate logs with traces** without extra config.

### Pluggable trace source

The trace context is produced by a `TraceContextProvider`. The default is
zero-dependency (reads the async store above). To pick up the **active
OpenTelemetry span** when you run an OTel SDK, swap in the OTel provider:

```ts
import { LoggerModule, OtelTraceContextProvider } from '@mpgxc/logx';

LoggerModule.forRoot({
  isGlobal: true,
  traceContext: new OtelTraceContextProvider(), // needs @opentelemetry/api
});
```

Now logs are stamped with the real `trace_id`/`span_id` of the current span,
falling back to the middleware-generated ids when no span is active. Implement
`TraceContextProvider` yourself to bridge any other tracing system.

### Ship logs to an OpenTelemetry Collector

`OtlpExporter` sends logs over **OTLP/HTTP (JSON)** — no OTel SDK required
(Collectors accept OTLP/JSON on `/v1/logs`). Trace ids map to the OTLP record's
`traceId`/`spanId`, closing the loop:

```ts
import { OtlpExporter } from '@mpgxc/logx';

new OtlpExporter({ endpoint: 'http://collector:4318', serviceName: 'api' });
```

## Async configuration

```ts
LoggerModule.forRootAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    level: config.get('LOG_LEVEL'),
    json: config.get('NODE_ENV') === 'production',
    exporters: [new HttpExporter({ url: config.get('LOKI_URL')!, format: 'loki' })],
  }),
});
```

## Exporters

| Exporter             | Destination                          | Peer dependency |
| -------------------- | ------------------------------------ | --------------- |
| `ConsoleExporter`    | stdout/stderr (redacted JSON lines)  | — |
| `FileExporter`       | file with size-based rotation        | — |
| `HttpExporter`       | any HTTP sink (`json`/`ndjson`/`loki`) | — (uses global `fetch`) |
| `PgExporter`         | Postgres table                       | `pg` |
| `MongoExporter`      | MongoDB collection                   | `mongodb` |
| `DynamoDBExporter`   | DynamoDB table                       | `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` |
| `CloudWatchExporter` | AWS CloudWatch Logs                  | `@aws-sdk/client-cloudwatch-logs` |
| `OtlpExporter`       | OpenTelemetry Collector (OTLP/HTTP)  | — (uses global `fetch`) |

```ts
new HttpExporter({ url, format: 'loki', labels: { app: 'api' } });
new PgExporter({ connectionString: process.env.DATABASE_URL, table: 'logs' });
new MongoExporter({ uri, collection: 'logs', ttlSeconds: 60 * 60 * 24 * 30 });
new DynamoDBExporter({ table: 'logs', region: 'us-east-1' });
new CloudWatchExporter({ logGroupName: '/api', logStreamName: 'app' });
```

### Writing your own exporter

Implement the `LogExporter` interface — the dispatcher handles batching,
redaction, lifecycle and error isolation for you:

```ts
import type { LogExporter, LogRecord } from '@mpgxc/logx';

export class SlackExporter implements LogExporter {
  readonly name = 'slack';

  async init() { /* open connections */ }

  async export(records: LogRecord[]) {
    // ship the batch; swallow transport errors so one bad send never
    // impacts the app or the other exporters.
  }

  async close() { /* cleanup on shutdown */ }
}
```

## HTTP request logging

Register `LoggingInterceptor` to log one line per HTTP request — method, path,
status code and latency — automatically stamped with the active `trace_id` /
`correlationId`:

```ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from '@mpgxc/logx';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class AppModule {}
```

Requests slower than `slowThresholdMs` are logged at `warn`; failures at
`error` (and re-thrown). Non-HTTP contexts (RPC/WebSocket) pass through
untouched. Configure via the `LOGGING_OPTIONS` token:

```ts
{ provide: LOGGING_OPTIONS, useValue: { slowThresholdMs: 500, includeIp: true } }
```

## Resilience

The dispatcher never lets logging destabilize the app:

- **Bounded buffer** — capped at `maxBufferSize`; on overflow it sheds load per
  `dropPolicy` (`oldest` by default) instead of growing without limit.
- **Retry with backoff** — a failing `export` is retried (`retry.attempts`) with
  exponential backoff before the batch is given up on.
- **Failure isolation** — one broken exporter never affects the others or the app.
- **Counters** — `dispatcher.stats` exposes `{ buffered, exported, dropped, failed }`.

## Configuration reference

```ts
LoggerModule.forRoot({
  isGlobal?: boolean;   // register globally                (default: false)
  level?: LogLevel;     // minimum level, cascading         (default: env-based)
  json?: boolean;       // structured JSON on stdout        (default: true outside dev)
  colors?: boolean;     // colorize stdout (ignored if json) (default: dev only)
  redact?: string[];    // keys stripped from meta          (default: [])
  exporters?: LogExporter[];                                 // default: []
  batch?: { size?: number; intervalMs?: number };            // default: 100 / 2000ms
  maxBufferSize?: number;                                     // default: 10000
  dropPolicy?: 'oldest' | 'newest';                          // default: 'oldest'
  retry?: { attempts?: number; backoffMs?: number; maxBackoffMs?: number }; // 3 / 200 / 5000
  traceContext?: TraceContextProvider;                       // default: ALS (zero-dep)
});
```

## Migrating from v1

v2 is a ground-up rewrite (**breaking**):

- **Requires NestJS 11+** (`@nestjs/common`/`@nestjs/core` `^11`).
- `LoggerInject` → **`InjectLogger`**, backed by `forFeature([...])`.
  The v1 global token registry (`LoggerModule.tokensForLoggers`) — which
  leaked state across modules/tests — is **removed**. Direct injection now
  infers the context automatically, so most call sites need no decorator at all.
- New `forRoot(options)` / `forRootAsync(options)` accept exporters, level,
  redaction and batching.

## License

MIT © [mpgxc](https://github.com/mpgxc)
