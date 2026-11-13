import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const swPath = fileURLToPath(new URL('../public/sw.js', import.meta.url));
const code = fs.readFileSync(swPath, 'utf8');

interface Handler { (e: unknown): void }

function loadSW(opts: { networkOk: boolean }) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, string>();
  const cache = {
    addAll: async (urls: string[]) => { urls.forEach((u) => store.set(u, 'shell:' + u)); },
    put: async (req: unknown, res: { body: string }) => { store.set(key(req), res.body); },
    match: async (req: unknown) => (store.has(key(req)) ? { body: store.get(key(req)) } : undefined),
  };
  const caches = {
    open: async () => cache,
    keys: async () => [...store.keys()].length ? ['pianoflow-v1', 'old'] : ['pianoflow-v1'],
    delete: async (k: string) => { if (k === 'old') return true; return false; },
    match: async (req: unknown) => (store.has(key(req)) ? { body: store.get(key(req)) } : undefined),
  };
  function key(req: unknown): string {
    return typeof req === 'string' ? req : (req as { url: string }).url;
  }
  const self = {
    location: { origin: 'http://localhost' },
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetch = async (req: unknown) => {
    if (!opts.networkOk) throw new Error('offline');
    const body = 'net:' + key(req);
    return { ok: true, body, clone: () => ({ body }) };
  };
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', code)(self, caches, fetch);
  return { handlers, store };
}

function fire(handlers: Record<string, Handler>, type: string, event: Record<string, unknown>) {
  const waits: Promise<unknown>[] = [];
  const responses: Promise<unknown>[] = [];
  event.waitUntil = (p: Promise<unknown>) => waits.push(p);
  event.respondWith = (p: Promise<unknown>) => responses.push(p);
  handlers[type](event);
  return { waits, responses };
}

describe('service worker runtime', () => {
  it('install precaches the app shell', async () => {
    const { handlers, store } = loadSW({ networkOk: true });
    const { waits } = fire(handlers, 'install', {});
    await Promise.all(waits);
    expect(store.has('index.html')).toBe(true);
    expect(store.has('manifest.webmanifest')).toBe(true);
    expect(store.has('icons/icon-512.png')).toBe(true);
  });

  it('navigation falls back to cached shell when offline', async () => {
    const { handlers, store } = loadSW({ networkOk: false });
    store.set('index.html', 'cached-shell');
    const { responses } = fire(handlers, 'fetch', {
      request: { method: 'GET', mode: 'navigate', url: 'http://localhost/' },
    });
    const res = (await Promise.all(responses))[0] as { body: string };
    expect(res.body).toBe('cached-shell');
  });

  it('asset request is cached after a successful network fetch', async () => {
    const { handlers, store } = loadSW({ networkOk: true });
    const url = 'http://localhost/songs/twinkle.mid';
    const { responses } = fire(handlers, 'fetch', { request: { method: 'GET', mode: 'no-cors', url } });
    const res = (await Promise.all(responses))[0] as { body: string };
    expect(res.body).toBe('net:' + url);
    // allow the background cache.put to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(store.has(url)).toBe(true);
  });

  it('ignores cross-origin and non-GET requests', () => {
    const { handlers } = loadSW({ networkOk: true });
    const a = fire(handlers, 'fetch', { request: { method: 'GET', mode: 'no-cors', url: 'https://cdn.example/x.js' } });
    expect(a.responses.length).toBe(0);
    const b = fire(handlers, 'fetch', { request: { method: 'POST', mode: 'no-cors', url: 'http://localhost/api' } });
    expect(b.responses.length).toBe(0);
  });
});
