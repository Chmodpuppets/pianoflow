import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { t } from '@pianoflow/core';
import type { Lang } from '@pianoflow/core';
import { applyStaticTranslations, htmlLang } from '../src/i18n-dom';

/**
 * Real-DOM runtime verification of the language switch: load the actual
 * index.html into jsdom and run the exact production substitution path
 * (applyStaticTranslations) for both languages. Proves the chrome genuinely
 * flips EN↔中文, that placeholders/titles/aria are applied, that no translatable
 * element wraps child markup (which textContent would clobber), and that repeated
 * application is stable.
 */

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
let doc: Document;
const tr = (lang: Lang) => (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

beforeAll(() => {
  doc = new JSDOM(html).window.document;
});

describe('applyStaticTranslations (real DOM)', () => {
  it('no data-i18n element wraps child elements (textContent clobber guard)', () => {
    const offenders: string[] = [];
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
      if (el.children.length > 0) offenders.push(el.getAttribute('data-i18n') ?? el.tagName);
    });
    expect(offenders).toEqual([]);
  });

  it('translates representative chrome into Chinese', () => {
    applyStaticTranslations(doc, tr('zh'));
    const get = (key: string) => doc.querySelector(`[data-i18n="${key}"]`)?.textContent;
    expect(get('welcome.guest')).toBe('以访客身份继续');
    expect(get('nav.songs')).toBe('🎵 曲库');
    expect(get('nav.settings')).toBe('⚙️ 设置');
    expect(get('songs.open')).toBe('📂 打开 .mid');
    expect(get('practice.start')).toBe('▶ 开始练习');
    expect(get('pause.resume')).toBe('▶ 继续');
    expect(get('result.retry')).toBe('↻ 重试');
  });

  it('applies placeholder, title and aria translations', () => {
    applyStaticTranslations(doc, tr('zh'));
    const search = doc.querySelector('[data-i18n-placeholder="songs.search"]') as HTMLInputElement;
    expect(search.placeholder).toBe('搜索曲目、艺术家或作曲者…');
    const titled = doc.querySelector('[data-i18n-title="player.mute"]') as HTMLElement;
    expect(titled.title).toBe('静音 / 取消静音');
    const aria = doc.querySelector('[data-i18n-aria="coach.aria"]') as HTMLElement;
    expect(aria.getAttribute('aria-label')).toBe('玩法说明');
  });

  it('flips back to English on re-application', () => {
    applyStaticTranslations(doc, tr('zh'));
    applyStaticTranslations(doc, tr('en'));
    const get = (key: string) => doc.querySelector(`[data-i18n="${key}"]`)?.textContent;
    expect(get('welcome.guest')).toBe('Continue as Guest');
    expect(get('nav.songs')).toBe('🎵 Songs');
    expect(get('songs.open')).toBe('📂 Open .mid');
    const search = doc.querySelector('[data-i18n-placeholder="songs.search"]') as HTMLInputElement;
    expect(search.placeholder).toBe('Search songs, artists, or composers…');
  });

  it('is idempotent — repeated application does not corrupt text', () => {
    applyStaticTranslations(doc, tr('zh'));
    const before = doc.querySelector('[data-i18n="welcome.guest"]')?.textContent;
    applyStaticTranslations(doc, tr('zh'));
    applyStaticTranslations(doc, tr('zh'));
    expect(doc.querySelector('[data-i18n="welcome.guest"]')?.textContent).toBe(before);
    // child controls inside labels survive (they are not data-i18n targets)
    expect(doc.querySelectorAll('#screen-library select, #screen-library input').length).toBeGreaterThan(0);
  });

  it('every tagged key resolves to a real translation (no raw keys leak)', () => {
    applyStaticTranslations(doc, tr('zh'));
    const leaks: string[] = [];
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')!;
      // a leaked key would render as the dotted key itself
      if (el.textContent === key) leaks.push(key);
    });
    expect(leaks).toEqual([]);
  });

  it('htmlLang maps to BCP-47 tags', () => {
    expect(htmlLang('zh')).toBe('zh-CN');
    expect(htmlLang('en')).toBe('en');
  });
});
