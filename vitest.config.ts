import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: false,
    reporters: ['default'],
    // Integration tests for problem 5 hit a real Postgres — keep tests within a
    // single file sequential so describe-level seeding is predictable.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
