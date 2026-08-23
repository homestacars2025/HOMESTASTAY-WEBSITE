import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { pickLocalizedName, type LocalizedNames } from './localize';

/**
 * Translated country names, keyed by ISO code.
 *
 * WHY THIS IS A SEPARATE LOOKUP AND NOT A JOIN
 *   Two country tables exist and they are not related to each other:
 *
 *     geo_countries  id (uuid), name, iso_code   ← what properties.country_id points at
 *     countries      code (ISO), name_en/tr/ar   ← where the translations live
 *
 *   There is no foreign key between them — verified against the live database,
 *   which answers a `geo_countries?select=countries(...)` embed with PGRST200,
 *   "no matches were found". So PostgREST cannot bring the translated name back
 *   in the units query however the select is written, and the bridge has to be
 *   made here, in code, on geo_countries.iso_code = countries.code.
 *
 * The table is ~250 rows of static reference data that changes approximately
 * never, so it is fetched once and cached for a day rather than joined per
 * unit. Tagged 'units' as well, so the existing revalidate webhook clears it
 * along with everything else rather than needing a tag of its own.
 */

type CountryRow = LocalizedNames & { code?: string | null };

const cachedCountries = unstable_cache(
  async (): Promise<CountryRow[]> => {
    const { data, error } = await createPublicClient()
      .from('countries')
      .select('code,name_en,name_tr,name_ar');

    if (error) {
      // Not fatal: every caller falls back to geo_countries.name, which is the
      // English-ish canonical spelling. A missing translation costs a guest the
      // localised country name, never the country.
      console.error('[geo:countries] lookup failed', { message: error.message });
      return [];
    }
    return data ?? [];
  },
  ['geo-country-names'],
  { tags: ['units'], revalidate: 86400 },
);

/** ISO code (upper-cased) → the row carrying its translations. */
export async function countryNamesByIso(): Promise<Map<string, CountryRow>> {
  const rows = await cachedCountries();
  const map = new Map<string, CountryRow>();
  for (const row of rows) {
    const code = typeof row.code === 'string' ? row.code.trim().toUpperCase() : '';
    if (code) map.set(code, row);
  }
  return map;
}

/**
 * One country's name in the visitor's language.
 *
 * `canonical` is geo_countries.name — passed in because it is the fallback when
 * the ISO code is missing, unknown to the countries table, or the whole lookup
 * failed. Callers that already hold the map should use it directly rather than
 * awaiting this per row.
 */
export function localizedCountryName(
  locale: string,
  iso: string | null | undefined,
  canonical: string | null | undefined,
  names: Map<string, CountryRow>,
): string | null {
  const row = iso ? names.get(iso.trim().toUpperCase()) : undefined;
  return pickLocalizedName(locale, row ?? null) ?? (canonical?.trim() || null);
}
