import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    servidor: 'src/servidor.ts',
    migrar: 'scripts/migrar.ts',
    semear: 'scripts/semear.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  bundle: true,
  noExternal: [/^@bastion\//],
});
