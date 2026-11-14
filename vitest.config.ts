import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@pianoflow/core': r('./packages/core/src/index.ts'),
      '@pianoflow/audio': r('./packages/audio/src/index.ts'),
      '@pianoflow/render': r('./packages/render/src/index.ts'),
      '@pianoflow/input': r('./packages/input/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
