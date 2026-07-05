import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LogExporter, LogRecord } from '../logger.interfaces';

export interface FileExporterOptions {
  /** Destination path for the log file. */
  path: string;
  /** Rotate once the file grows past this many bytes. Default: 10 MB. */
  maxSizeBytes?: number;
  /** How many rotated files to keep (`app.log.1`, `.2`, …). Default: 5. */
  maxFiles?: number;
}

/**
 * Appends records as newline-delimited JSON to a file, with simple
 * size-based rotation. Zero dependencies.
 */
export class FileExporter implements LogExporter {
  readonly name = 'file';
  private stream: WriteStream | null = null;
  private written = 0;

  private readonly path: string;
  private readonly maxSizeBytes: number;
  private readonly maxFiles: number;

  constructor(options: FileExporterOptions) {
    this.path = options.path;
    this.maxSizeBytes = options.maxSizeBytes ?? 10 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });

    try {
      this.written = (await stat(this.path)).size;
    } catch {
      this.written = 0;
    }

    this.open();
  }

  private open(): void {
    this.stream = createWriteStream(this.path, { flags: 'a' });
  }

  async export(records: LogRecord[]): Promise<void> {
    if (!this.stream) {
      this.open();
    }

    const payload = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    this.written += Buffer.byteLength(payload);
    this.stream!.write(payload);

    if (this.written >= this.maxSizeBytes) {
      await this.rotate();
    }
  }

  private async rotate(): Promise<void> {
    await this.closeStream();

    for (let i = this.maxFiles - 1; i >= 1; i--) {
      await rename(`${this.path}.${i}`, `${this.path}.${i + 1}`).catch(
        () => {},
      );
    }
    await rename(this.path, `${this.path}.1`).catch(() => {});

    this.written = 0;
    this.open();
  }

  private closeStream(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.stream) {
        return resolve();
      }
      this.stream.end(() => resolve());
      this.stream = null;
    });
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  async close(): Promise<void> {
    await this.closeStream();
  }
}
