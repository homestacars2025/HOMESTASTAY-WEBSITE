import type { LegalDocContent } from '@/lib/booking/documents';
import { onBilgilendirmeTr } from './on-bilgilendirme/tr';
import { onBilgilendirmeEn } from './on-bilgilendirme/en';
import { mesafeliSatisTr } from './mesafeli-satis/tr';
import { mesafeliSatisEn } from './mesafeli-satis/en';

export type LegalDocSlug = 'on-bilgilendirme' | 'mesafeli-satis';

/**
 * Locale → text, per document.
 *
 * DELIBERATELY TR + EN ONLY FOR NOW. These are Turkish legal instruments —
 * the lawyer-approved Turkish original plus an English courtesy translation.
 * Arabic and Russian translations have not been produced yet, and a *wrong*
 * translation of a withdrawal-rights clause is worse than an untranslated one.
 *
 * ar/ru therefore fall back to English AND the page shows the guest an
 * explicit notice saying so — never a silent language substitution.
 *
 * When ar/ru translations land: add ar.ts / ru.ts here and the notice
 * disappears on its own.
 */
const DOCS: Record<LegalDocSlug, Partial<Record<string, LegalDocContent>>> = {
  'on-bilgilendirme': { tr: onBilgilendirmeTr, en: onBilgilendirmeEn },
  'mesafeli-satis':   { tr: mesafeliSatisTr,   en: mesafeliSatisEn   },
};

export interface ResolvedLegalDoc {
  content: LegalDocContent;
  /** The locale actually rendered — may differ from the requested one. */
  shownLocale: 'tr' | 'en';
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
    return {
      content: exact,
      shownLocale: locale === 'tr' ? 'tr' : 'en',
      isFallback: false,
    };
  }

  return { content: byLocale.en!, shownLocale: 'en', isFallback: true };
}
