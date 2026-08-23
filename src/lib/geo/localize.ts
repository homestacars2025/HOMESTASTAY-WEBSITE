/**
 * Choosing a place name in the visitor's language.
 *
 * The geo tables (geo_cities, geo_districts, countries) each carry name_ar,
 * name_en and name_tr beside the canonical `name`. This is the one place that
 * decides which of them a guest sees, so a city cannot read "Istanbul" on the
 * card and "إسطنبول" in the breadcrumb of the same page.
 *
 * WHAT `name` IS, AND WHY IT IS NOT A TRANSLATION
 *   `name` is the canonical identifier: it is what the city filter matches on
 *   (`properties.geo_cities.name`), what destination slugs are derived from,
 *   and what the host form saves. It is the LAST fallback here and must never
 *   become the display name where a translation exists — but equally, nothing
 *   in this file may be used to build a URL, a slug or a query filter, or the
 *   same city would resolve to four different addresses.
 *
 * RUSSIAN HAS NO COLUMN. The site routes four locales (en, ar, tr, ru) and the
 * geo tables carry three. `ru` therefore resolves through the English rung
 * every time, which is correct — a Latin "Istanbul" is far better for a Russian
 * reader than the Turkish "Şişli" spelling or a blank. When a name_ru column
 * appears, adding it to COLUMN below is the whole change.
 */

/** The DB column that holds each locale's name. Absent = fall through to English. */
const COLUMN: Partial<Record<string, 'name_ar' | 'name_en' | 'name_tr'>> = {
  ar: 'name_ar',
  en: 'name_en',
  tr: 'name_tr',
};

/**
 * A geo row's names. Shaped to accept a raw Supabase row directly — every field
 * is optional so a partial select, or an embed that came back null, is a
 * fallback rather than a crash.
 */
export type LocalizedNames = {
  name_ar?: string | null;
  name_en?: string | null;
  name_tr?: string | null;
  /** The canonical name. The last rung, never skipped. */
  name?: string | null;
} | null | undefined;

/** Blank strings are as useless as null here, and the DB has both. */
function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length ? trimmed : null;
}

/**
 * The name for `locale`, falling back to English and then to the canonical
 * `name`.
 *
 * Returns null ONLY when the row itself is null or every name on it is empty —
 * so a caller that has a row at all can rely on getting something printable.
 * That is what lets the display sites drop their own `?? ''` guards.
 */
export function pickLocalizedName(locale: string, row: LocalizedNames): string | null {
  if (!row) return null;

  const column = COLUMN[locale];
  return (
    (column ? clean(row[column]) : null) ??
    clean(row.name_en) ??
    clean(row.name) ??
    null
  );
}

/**
 * The same choice, spelled out rather than read off a row.
 *
 * For callers that have already destructured their names, or that are picking
 * between values from more than one table.
 */
export function pickLocalized(
  locale: string,
  names: { ar?: string | null; en?: string | null; tr?: string | null; fallback?: string | null },
): string | null {
  return pickLocalizedName(locale, {
    name_ar: names.ar,
    name_en: names.en,
    name_tr: names.tr,
    name: names.fallback,
  });
}

/**
 * "District, City" — or just the city when there is no district.
 *
 * The join is the whole point: 126 of the 146 properties have no district, so
 * the common case must not print a leading comma, a trailing comma, or a
 * doubled space. Passing null for either side is normal, not exceptional.
 *
 * Arabic gets its own comma (U+060C). A Latin comma inside an RTL line is a
 * neutral character that the bidi algorithm can reorder, and it simply reads
 * wrong next to Arabic letterforms.
 */
export function formatPlace(
  locale: string,
  district: string | null | undefined,
  city: string | null | undefined,
): string | null {
  const parts = [clean(district), clean(city)].filter((p): p is string => p !== null);

  // A unit whose district is recorded as its city ("Istanbul, Istanbul") —
  // real in this data, and it has to collapse to one name.
  const unique = parts.filter(
    (p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i,
  );
  if (!unique.length) return null;

  return unique.join(locale === 'ar' ? '، ' : ', ');
}

/** True for the one locale that has to lay these strings out right-to-left. */
export function isRtlLocale(locale: string): boolean {
  return locale === 'ar';
}
