import { describe, it, expect } from 'vitest';
import { MESSAGES, t, detectLang, isLang, LANGS } from '../src/i18n';

describe('i18n catalogue', () => {
  it('every entry has a non-empty English and Chinese string', () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
      expect(typeof entry.en, key).toBe('string');
      expect(typeof entry.zh, key).toBe('string');
      expect(entry.en.length, `${key}.en`).toBeGreaterThan(0);
      expect(entry.zh.length, `${key}.zh`).toBeGreaterThan(0);
    }
  });

  it('exposes both languages in the picker', () => {
    expect(LANGS.map((l) => l.id)).toEqual(['en', 'zh']);
    expect(LANGS.find((l) => l.id === 'zh')?.label).toBe('中文');
  });
});

describe('t()', () => {
  it('returns the requested language', () => {
    expect(t('en', 'welcome.guest')).toBe('Continue as Guest');
    expect(t('zh', 'welcome.guest')).toBe('以访客身份继续');
  });

  it('interpolates {placeholders}', () => {
    expect(t('en', 'hud.hits', { hits: 3, total: 10, combo: 2, pct: 90 })).toBe('Hits 3/10 · Combo 2 · Acc 90%');
    expect(t('zh', 'review.chip', { n: 6, pct: 0 })).toBe('▶ 第 6 小节 · 0%');
  });

  it('replaces every occurrence of a placeholder', () => {
    expect(t('en', 'result.stats2', { perfect: 1, good: 1, miss: 1, wrong: 1 })).toContain('Perfect 1');
  });

  it('falls back to English for an unknown language value at runtime', () => {
    // @ts-expect-error exercising the runtime fallback path
    expect(t('fr', 'welcome.guest')).toBe('Continue as Guest');
  });

  it('falls back to the raw key when the entry is missing', () => {
    expect(t('en', 'no.such.key')).toBe('no.such.key');
    expect(t('zh', 'no.such.key')).toBe('no.such.key');
  });
});

describe('detectLang()', () => {
  it('maps Chinese locales to zh', () => {
    expect(detectLang('zh-CN')).toBe('zh');
    expect(detectLang('zh')).toBe('zh');
    expect(detectLang('zh-Hant-TW')).toBe('zh');
  });
  it('maps everything else to en', () => {
    expect(detectLang('en-US')).toBe('en');
    expect(detectLang('fr')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
    expect(detectLang(null)).toBe('en');
  });
});

describe('isLang()', () => {
  it('accepts only en/zh', () => {
    expect(isLang('en')).toBe(true);
    expect(isLang('zh')).toBe(true);
    expect(isLang('fr')).toBe(false);
    expect(isLang(null)).toBe(false);
    expect(isLang(1)).toBe(false);
  });
});
