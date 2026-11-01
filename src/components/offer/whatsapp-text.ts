/**
 * A date for the prefilled WhatsApp message, in the visitor's language:
 * "1 Nov 2026", "1 Kasım 2026", "1 نوفمبر 2026", "1 ноября 2026".
 *
 * Built from Intl's day / month / year PARTS so no locale's extras ride
 * along (Russian's trailing "г."), and Arabic keeps Latin digits — the
 * reference beside it is Latin, and staff read these in the inbox.
 */
export function offerMessageDate(d: Date, locale: string): string {
  const tag = locale === 'en' ? 'en-GB' : locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const month = locale === 'en' ? 'short' : 'long';
  return new Intl.DateTimeFormat(tag, { day: 'numeric', month, year: 'numeric' })
    .formatToParts(d)
    .filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year')
    .map((p) => p.value)
    .join(' ');
}
