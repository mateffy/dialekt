import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/main.ts'],
  format: 'esm',
  dts: true,
});
