/**
 * city name → URL slug.
 *
 * WHY THIS EXISTS RATHER THAN v_city_live_stats.city_slug
 *   That view slugifies in Postgres with lower(), and lower('İzmit') in a
 *   non-Turkish collation yields 'i̇zmit' — a dotless i followed by U+0307
 *   COMBINING DOT ABOVE. That is a two-codepoint, non-ASCII "slug": it
 *   percent-encodes to /destinations/i%CC%87zmit, compares unequal to the
 *   visually identical 'izmit', and is a URL nobody would ever type or link.
 *   So the view's city_slug is used for NOTHING here — one slug function, in
 *   JS, applied to both sides of every comparison.
 *
 * The curated city_content.slug always wins when a city has published content
 * (see lib/queries/destinations). This is the fallback for cities that have
 * units but no editorial page yet, and it must be stable: a slug that changes
 * shape changes the URL, and a URL that changes is a 404 to everyone holding
 * the old one.
 */

/**
 * Turkish letters must be transliterated BEFORE any Unicode normalisation.
 * 'ı' and 'İ' carry no combining mark to strip — NFD leaves them untouched and
 * the [^a-z0-9] pass would then delete them outright, turning 'İzmit' into
 * 'zmit'. Mapping them explicitly is the only correct order.
 */
const TRANSLITERATE: Record<string, string> = {
  ı: 'i', İ: 'i',
  ş: 's', Ş: 's',
  ğ: 'g', Ğ: 'g',
  ü: 'u', Ü: 'u',
  ö: 'o', Ö: 'o',
  ç: 'c', Ç: 'c',
};

export function citySlug(name: string): string {
  return name
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => TRANSLITERATE[ch] ?? ch)
    // Everything else Latin-with-diacritics (é, â, î …) decomposes cleanly.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
