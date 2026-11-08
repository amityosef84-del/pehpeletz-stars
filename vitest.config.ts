import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'netlify/test/**/*.test.ts'],
    environment: 'node',
  },
});
