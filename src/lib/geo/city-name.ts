import { getMessages } from 'next-intl/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { pickLocalizedName } from './localize';
import { citySlug } from './city-slug';

/**
 * A city's name in the visitor's language, resolved from its canonical name.
 *
 * geo_cities.name is the Turkish/Latin spelling — "Antalya", "İzmit". Printing
 * that inside an Arabic sentence ("إقامات في Antalya") is a script collision on
 * the most prominent line of the page.
 *
 * THREE RUNGS, IN THIS ORDER
 *   1. The messages files, keyed by derived slug. Hand-written and deliberate,
 *      so an editorial spelling keeps winning over whatever is in the database.
 *      Only a handful of cities have one.
 *   2. geo_cities.name_ar / name_en / name_tr. This is the rung that was
 *      missing: it covers every city in the table (20 today, all three
 *      languages populated) instead of the six with message keys, and a city
 *      added tomorrow is translated without a code change.
 *   3. The canonical name, unchanged.
 *
 * WHY THE MESSAGE LOOKUP READS THE OBJECT RATHER THAN CALLING t()
 *   Most cities have no key, and a missing key makes next-intl throw (or render
 *   the key path). This needs a lookup that can MISS quietly.
 *
 * TAKES A NAME, NOT AN ID, because its callers (the destination pages) work
 * from v_city_live_stats, which carries the canonical name and no id. The
 * lookup below is therefore keyed by the lower-cased canonical name — the same
 * value the ?city= filter matches on, so the two cannot disagree about which
 * city is which.
 */

/** Canonical name (lower-cased) → that city's translated names. */
const cachedCityNames = unstable_cache(
  async (): Promise<Record<string, { name_ar: string | null; name_en: string | null; name_tr: string | null; name: string }>> => {
    const { data, error } = await createPublicClient()
      .from('geo_cities')
      .select('name,name_ar,name_en,name_tr');

    if (error) {
      // Never fatal: every caller still has the canonical name to print.
      console.error('[geo:city-name] lookup failed', { message: error.message });
      return {};
    }

    const map: Record<string, { name_ar: string | null; name_en: string | null; name_tr: string | null; name: string }> = {};
    for (const row of data ?? []) {
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) continue;
      map[name.toLowerCase()] = {
        name,
        name_ar: row.name_ar ?? null,
        name_en: row.name_en ?? null,
        name_tr: row.name_tr ?? null,
      };
    }
    return map;
  },
  ['geo-city-names'],
  { tags: ['units'], revalidate: 86400 },
);

export async function localizedCityName(
  cityName: string,
  locale: string,
): Promise<string> {
  const canonical = cityName?.trim() ?? '';
  if (!canonical) return cityName;

  // 1. Curated translation, if this city has one.
  const messages = (await getMessages({ locale })) as Record<string, unknown>;
  const cities = messages.cities;
  if (cities && typeof cities === 'object') {
    const translated = (cities as Record<string, unknown>)[citySlug(canonical)];
    if (typeof translated === 'string' && translated.trim() !== '') {
      return translated.trim();
    }
  }

  // 2. The database's own columns, which cover every city in the table.
  const byName = await cachedCityNames();
  const row = byName[canonical.toLowerCase()];

  // 3. Whatever we were handed.
  return pickLocalizedName(locale, row ?? null) ?? canonical;
}
