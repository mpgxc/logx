import type { LogExporter, LogRecord } from '../logger.interfaces';
import { loadOptional } from './optional-dep';

export interface PgExporterOptions {
  /** Postgres connection string (or pass an existing `pool`). */
  connectionString?: string;
  /** A pre-configured `pg.Pool`. Takes precedence over `connectionString`. */
  pool?: unknown;
  /** Destination table. Default: `logs`. */
  table?: string;
  /** Create the table on init if it doesn't exist. Default: true. */
  autoCreate?: boolean;
}

/**
 * Persists records into a Postgres table. Requires the optional peer
 * dependency `pg`.
 *
 * The default schema is:
 * ```sql
 * CREATE TABLE logs (
 *   id BIGSERIAL PRIMARY KEY,
 *   level TEXT, message TEXT, context TEXT,
 *   timestamp TIMESTAMPTZ, pid INT, stack TEXT,
 *   correlation_id TEXT, meta JSONB
 * );
 * ```
 */
export class PgExporter implements LogExporter {
  readonly name = 'postgres';
  private pool: any;
  private readonly table: string;

  constructor(private readonly options: PgExporterOptions) {
    this.table = options.table ?? 'logs';
  }

  async init(): Promise<void> {
    if (this.options.pool) {
      this.pool = this.options.pool;
    } else {
      const pg = await loadOptional<any>('pg', 'PgExporter');
      const Pool = pg.Pool ?? pg.default?.Pool;
      this.pool = new Pool({ connectionString: this.options.connectionString });
    }

    if (this.options.autoCreate ?? true) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.table} (
          id BIGSERIAL PRIMARY KEY,
          level TEXT NOT NULL,
          message TEXT,
          context TEXT,
          timestamp TIMESTAMPTZ NOT NULL,
          pid INTEGER,
          stack TEXT,
          correlation_id TEXT,
          meta JSONB
        )
      `);
    }
  }

  async export(records: LogRecord[]): Promise<void> {
    if (!records.length || !this.pool) {
      return;
    }

    const columns = 8;
    const values: unknown[] = [];
    const rows = records.map((r, i) => {
      const base = i * columns;
      values.push(
        r.level,
        r.message,
        r.context ?? null,
        new Date(r.timestamp).toISOString(),
        r.pid,
        r.stack ?? null,
        r.correlationId ?? null,
        r.meta ? JSON.stringify(r.meta) : null,
      );
      // 8 real columns; id is serial.
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
    });

    await this.pool.query(
      `INSERT INTO ${this.table}
        (level, message, context, timestamp, pid, stack, correlation_id, meta)
       VALUES ${rows.join(',')}`,
      values,
    );
  }

  async close(): Promise<void> {
    // Only close pools we created ourselves.
    if (this.pool && !this.options.pool) {
      await this.pool.end();
    }
  }
}
