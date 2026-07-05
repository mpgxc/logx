import type { LogExporter, LogRecord } from '../logger.interfaces';
import { loadOptional } from './optional-dep';

export interface MongoExporterOptions {
  /** MongoDB connection URI. */
  uri: string;
  /** Database name. Default: inferred from the URI or `logs`. */
  database?: string;
  /** Collection name. Default: `logs`. */
  collection?: string;
  /**
   * TTL (seconds) for a `createdAt` index — auto-expire old logs.
   * Omit to keep logs forever.
   */
  ttlSeconds?: number;
}

/**
 * Persists records into a MongoDB collection. Requires the optional peer
 * dependency `mongodb`.
 */
export class MongoExporter implements LogExporter {
  readonly name = 'mongodb';
  private client: any;
  private coll: any;

  constructor(private readonly options: MongoExporterOptions) {}

  async init(): Promise<void> {
    const mongodb = await loadOptional<any>('mongodb', 'MongoExporter');
    const MongoClient = mongodb.MongoClient ?? mongodb.default?.MongoClient;

    this.client = new MongoClient(this.options.uri);
    await this.client.connect();

    const db = this.client.db(this.options.database);
    this.coll = db.collection(this.options.collection ?? 'logs');

    if (this.options.ttlSeconds) {
      await this.coll.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: this.options.ttlSeconds },
      );
    }
  }

  async export(records: LogRecord[]): Promise<void> {
    if (!records.length || !this.coll) {
      return;
    }

    await this.coll.insertMany(
      records.map((r) => ({ ...r, createdAt: new Date(r.timestamp) })),
      { ordered: false },
    );
  }

  async close(): Promise<void> {
    await this.client?.close();
  }
}
