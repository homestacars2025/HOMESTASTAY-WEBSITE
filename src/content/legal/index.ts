import type { LegalDocContent } from '@/lib/booking/documents';
import { onBilgilendirmeTr } from './on-bilgilendirme/tr';
import { onBilgilendirmeEn } from './on-bilgilendirme/en';
import { onBilgilendirmeAr } from './on-bilgilendirme/ar';
import { onBilgilendirmeRu } from './on-bilgilendirme/ru';
import { mesafeliSatisTr } from './mesafeli-satis/tr';
import { mesafeliSatisEn } from './mesafeli-satis/en';
import { mesafeliSatisAr } from './mesafeli-satis/ar';
import { mesafeliSatisRu } from './mesafeli-satis/ru';

export type LegalDocSlug = 'on-bilgilendirme' | 'mesafeli-satis';

/**
 * Locale → text, per document.
 *
 * All four locales (tr, en, ar, ru) now render natively. The Turkish text is
 * the lawyer-approved, legally-operative original; en/ar/ru are lawyer-reviewed
 * courtesy translations (each carries a disclaimer that Turkish binds). Because
 * every supported locale has real content, getLegalDoc never falls back and the
 * page never shows the language-fallback notice.
 *
 * A locale outside the four (shouldn't happen — the app only serves these)
 * still falls back to English with the explicit notice, rather than a blank
 * page or a silent substitution.
 */
const DOCS: Record<LegalDocSlug, Partial<Record<string, LegalDocContent>>> = {
  'on-bilgilendirme': {
    tr: onBilgilendirmeTr, en: onBilgilendirmeEn,
    ar: onBilgilendirmeAr, ru: onBilgilendirmeRu,
  },
  'mesafeli-satis': {
    tr: mesafeliSatisTr, en: mesafeliSatisEn,
    ar: mesafeliSatisAr, ru: mesafeliSatisRu,
  },
};

export interface ResolvedLegalDoc {
  content: LegalDocContent;
  /** The locale actually rendered — equals the requested one unless we fell back. */
  shownLocale: string;
  /** True when we fell back, so the page can say so out loud. */
  isFallback: boolean;
}

export function getLegalDoc(
  slug: LegalDocSlug,
  locale: string,
): ResolvedLegalDoc {
  const byLocale = DOCS[slug];
  const exact = byLocale[locale];

  if (exact) {
    return { content: exact, shownLocale: locale, isFallback: false };
  }

  return { content: byLocale.en!, shownLocale: 'en', isFallback: true };
}
