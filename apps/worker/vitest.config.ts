import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Os testes de integração exigem o Compose no ar: rodam com `pnpm test:integracao`.
    exclude: ['src/**/*.integracao.test.ts', 'node_modules/**'],
    environment: 'node',
  },
});
