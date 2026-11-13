import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const songsDir = r('./public/songs');

interface AutoEntry { id: string; file: string }

/** Enumerate every .mid/.midi currently in the public songs folder. */
function scanSongs(): AutoEntry[] {
  let names: string[] = [];
  try { names = fs.readdirSync(songsDir); } catch { return []; }
  return names
    .filter((n) => /\.(mid|midi)$/i.test(n))
    .sort((a, b) => a.localeCompare(b))
    .map((n) => ({
      id: n.replace(/\.(mid|midi)$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      file: n,
    }));
}

/**
 * Auto-index the songs folder so dropping a .mid file in makes it appear in the
 * library with no manifest editing. In dev a middleware serves a fresh scan and
 * a folder watcher pushes a live-refresh event; at build time the scan is baked
 * into dist/songs/auto.json for static hosting.
 */
function songsAutoIndex(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'pianoflow-songs-auto-index',
    configResolved(cfg) {
      root = cfg.root;
      outDir = cfg.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/songs/auto.json', (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(scanSongs()));
      });
      let timer: NodeJS.Timeout | null = null;
      try {
        fs.watch(songsDir, () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            server.ws.send({ type: 'custom', event: 'pianoflow:songs-changed' });
          }, 120);
        });
      } catch { /* folder may not exist yet */ }
    },
    closeBundle() {
      try {
        const dir = path.resolve(root, outDir, 'songs');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'auto.json'), JSON.stringify(scanSongs(), null, 2));
      } catch { /* non-fatal */ }
    },
  };
}

export default defineConfig({
  plugins: [songsAutoIndex()],
  resolve: {
    alias: {
      '@pianoflow/core': r('../../packages/core/src/index.ts'),
      '@pianoflow/audio': r('../../packages/audio/src/index.ts'),
      '@pianoflow/render': r('../../packages/render/src/index.ts'),
      '@pianoflow/input': r('../../packages/input/src/index.ts'),
    },
  },
  server: { port: 5173, host: true },
  build: { outDir: 'dist', target: 'es2022' },
});
