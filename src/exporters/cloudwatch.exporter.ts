import type { LogExporter, LogRecord } from '../logger.interfaces';
import { loadOptional } from './optional-dep';

export interface CloudWatchExporterOptions {
  /** Log group name. */
  logGroupName: string;
  /** Log stream name within the group. */
  logStreamName: string;
  /** AWS region. Falls back to the SDK's default resolution. */
  region?: string;
  /** Create the log group and stream on init if missing. Default: true. */
  autoCreate?: boolean;
}

/**
 * Ships records to AWS CloudWatch Logs via `PutLogEvents`, tracking the
 * sequence token between batches. Requires the optional peer dependency
 * `@aws-sdk/client-cloudwatch-logs`.
 */
export class CloudWatchExporter implements LogExporter {
  readonly name = 'cloudwatch';
  private client: any;
  private sdk: any;
  private sequenceToken: string | undefined;

  constructor(private readonly options: CloudWatchExporterOptions) {}

  async init(): Promise<void> {
    this.sdk = await loadOptional<any>(
      '@aws-sdk/client-cloudwatch-logs',
      'CloudWatchExporter',
    );

    this.client = new this.sdk.CloudWatchLogsClient(
      this.options.region ? { region: this.options.region } : {},
    );

    if (this.options.autoCreate ?? true) {
      await this.ensureGroupAndStream();
    }
  }

  private async ensureGroupAndStream(): Promise<void> {
    const { CreateLogGroupCommand, CreateLogStreamCommand } = this.sdk;

    await this.client
      .send(
        new CreateLogGroupCommand({ logGroupName: this.options.logGroupName }),
      )
      .catch(() => {}); // ResourceAlreadyExists is fine.

    await this.client
      .send(
        new CreateLogStreamCommand({
          logGroupName: this.options.logGroupName,
          logStreamName: this.options.logStreamName,
        }),
      )
      .catch(() => {});
  }

  async export(records: LogRecord[]): Promise<void> {
    if (!records.length || !this.client) {
      return;
    }

    const { PutLogEventsCommand } = this.sdk;

    // CloudWatch requires events sorted by timestamp, ascending.
    const logEvents = records
      .map((r) => ({ timestamp: r.timestamp, message: JSON.stringify(r) }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const result = await this.client.send(
      new PutLogEventsCommand({
        logGroupName: this.options.logGroupName,
        logStreamName: this.options.logStreamName,
        logEvents,
        sequenceToken: this.sequenceToken,
      }),
    );

    this.sequenceToken = result.nextSequenceToken;
  }

  async close(): Promise<void> {
    this.client?.destroy?.();
  }
}
