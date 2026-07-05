import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  splitting: false,
  // Never bundle the optional heavy peer deps into the output.
  external: [
    'pg',
    'mongodb',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb',
    '@aws-sdk/client-cloudwatch-logs',
    '@opentelemetry/api',
  ],
});
