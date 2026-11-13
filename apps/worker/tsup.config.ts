import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { principal: 'src/principal.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  bundle: true,
  noExternal: [/^@bastion\//],
});
