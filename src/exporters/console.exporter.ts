import type { LogExporter, LogRecord } from '../logger.interfaces';

export interface ConsoleExporterOptions {
  /** Write as newline-delimited JSON instead of the native pretty output. */
  json?: boolean;
}

/**
 * Writes records straight to `process.stdout` / `process.stderr` as JSON
 * lines. Zero dependencies.
 *
 * Note: the underlying {@link LoggerService} already prints to the console
 * natively, so this exporter is mainly useful as a reference implementation
 * or when you want the exported (redacted, correlated) shape on stdout.
 */
export class ConsoleExporter implements LogExporter {
  readonly name = 'console';

  constructor(private readonly options: ConsoleExporterOptions = {}) {}

  export(records: LogRecord[]): void {
    for (const record of records) {
      const line =
        this.options.json === false
          ? `${record.timestamp} [${record.level}] ${record.context ?? ''} ${record.message}`
          : JSON.stringify(record);

      const stream =
        record.level === 'error' || record.level === 'fatal'
          ? process.stderr
          : process.stdout;

      stream.write(`${line}\n`);
    }
  }
}
