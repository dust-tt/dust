import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'hanging-process'],
    // Force exit after tests complete
    teardownTimeout: 5000,
    // Isolate tests to prevent leaks
    isolate: true,
  },
});
