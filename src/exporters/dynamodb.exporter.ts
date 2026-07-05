import { randomUUID } from 'node:crypto';
import type { LogExporter, LogRecord } from '../logger.interfaces';
import { loadOptional } from './optional-dep';

export interface DynamoExporterOptions {
  /** Target table name. */
  table: string;
  /** AWS region. Falls back to the SDK's default resolution. */
  region?: string;
  /**
   * Attribute used as the partition key. Default: `id` (a generated UUID).
   * The record fields are stored as top-level attributes.
   */
  partitionKey?: string;
}

/**
 * Persists records into a DynamoDB table via `BatchWriteItem` (25 items per
 * request, as per the AWS limit). Requires the optional peer dependencies
 * `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb`.
 */
export class DynamoDBExporter implements LogExporter {
  readonly name = 'dynamodb';
  private doc: any;
  private BatchWriteCommand: any;
  private readonly pk: string;

  constructor(private readonly options: DynamoExporterOptions) {
    this.pk = options.partitionKey ?? 'id';
  }

  async init(): Promise<void> {
    const client = await loadOptional<any>(
      '@aws-sdk/client-dynamodb',
      'DynamoDBExporter',
    );
    const lib = await loadOptional<any>(
      '@aws-sdk/lib-dynamodb',
      'DynamoDBExporter',
    );

    const ddb = new client.DynamoDBClient(
      this.options.region ? { region: this.options.region } : {},
    );
    this.doc = lib.DynamoDBDocumentClient.from(ddb);
    this.BatchWriteCommand = lib.BatchWriteCommand;
  }

  async export(records: LogRecord[]): Promise<void> {
    if (!records.length || !this.doc) {
      return;
    }

    // DynamoDB caps BatchWriteItem at 25 items per request.
    for (let i = 0; i < records.length; i += 25) {
      const chunk = records.slice(i, i + 25);
      await this.doc.send(
        new this.BatchWriteCommand({
          RequestItems: {
            [this.options.table]: chunk.map((r) => ({
              PutRequest: {
                Item: { [this.pk]: randomUUID(), ...r },
              },
            })),
          },
        }),
      );
    }
  }

  async close(): Promise<void> {
    this.doc?.destroy?.();
  }
}
