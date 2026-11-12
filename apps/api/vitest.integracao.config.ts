import { defineConfig } from 'vitest/config';

// Testes de integração: exigem o Postgres do Compose (`pnpm infra:subir` + `pnpm banco:migrar:teste`).
export default defineConfig({
  test: {
    include: ['src/**/*.integracao.test.ts'],
    exclude: ['node_modules/**'],
    environment: 'node',
    // Todos os arquivos compartilham o banco `bastion_teste`.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
