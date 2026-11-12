import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integracao.test.ts', 'node_modules/**'],
    environment: 'node',
  },
});
