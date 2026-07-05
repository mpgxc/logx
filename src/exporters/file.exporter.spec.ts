import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileExporter } from './file.exporter';
import type { LogRecord } from '../logger.interfaces';

const rec = (msg: string): LogRecord => ({
  level: 'log',
  message: msg,
  timestamp: 1,
  pid: 1,
});

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('FileExporter', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'logx-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('appends records as newline-delimited JSON', async () => {
    const file = join(dir, 'app.log');
    const exporter = new FileExporter({ path: file });
    await exporter.init();

    await exporter.export([rec('one'), rec('two')]);
    await exporter.close();
    await settle();

    const content = await readFile(file, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).message).toBe('one');
    expect(JSON.parse(lines[1]).message).toBe('two');
  });

  it('rotates the file when it exceeds maxSizeBytes', async () => {
    const file = join(dir, 'app.log');
    const exporter = new FileExporter({
      path: file,
      maxSizeBytes: 50,
      maxFiles: 3,
    });
    await exporter.init();

    // Each record easily exceeds 50 bytes → triggers rotation.
    await exporter.export([rec('a'.repeat(60))]);
    await settle();
    await exporter.export([rec('b'.repeat(60))]);
    await exporter.close();
    await settle();

    const files = await readdir(dir);
    expect(files).toContain('app.log');
    expect(files).toContain('app.log.1');
  });
});
