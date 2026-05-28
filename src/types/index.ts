export type Locale = 'en' | 'ar' | 'tr' | 'ru';

export type Direction = 'ltr' | 'rtl';

export function getDirection(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
