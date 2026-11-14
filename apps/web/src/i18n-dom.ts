import type { Lang } from '@pianoflow/core';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Apply every static `data-i18n*` attribute in `doc` using `tr`.
 *
 * This is the DOM-only half of the language switch (the app-specific dynamic
 * views are re-rendered separately in main.ts). It is deliberately free of app
 * state so it can be exercised against a real DOM headlessly (jsdom) to prove the
 * chrome actually flips between English and Chinese without clobbering markup.
 *
 * `data-i18n` targets text-only elements; elements that mix text with controls
 * wrap the translatable text in their own `<span data-i18n>` so setting
 * `textContent` never destroys child nodes.
 */
export function applyStaticTranslations(doc: Document, tr: Translate): void {
  doc.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = tr(key);
  });
  doc.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) (el as HTMLInputElement).placeholder = tr(key);
  });
  doc.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = tr(key);
  });
  doc.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', tr(key));
  });
}

/** BCP-47 language tag for `<html lang>`. */
export function htmlLang(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : 'en';
}
