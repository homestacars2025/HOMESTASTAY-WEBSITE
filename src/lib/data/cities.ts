import { createClient } from '@/lib/supabase/server';
import { pickLocalizedName } from '@/lib/geo/localize';

interface GeoCityMedia {
  url: string;
  is_cover?: boolean;
  sort_order?: number;
}

export interface CityData {
  id: string;
  /** Canonical name. The slug and the ?city= filter are derived from THIS. */
  name: string;
  /** Same city in the visitor's language — display only. */
  localizedName: string;
  /**
   * Never null: getCities drops cities that have no cover image. The type says
   * so deliberately, so the card cannot grow a placeholder branch again and the
   * filter cannot be removed without the compiler noticing.
   */
  imageUrl: string;
}

/**
 * A city's cover image URL, or null when it has none.
 *
 * "Has an image" means: media is an array, it is not empty, and the entry we
 * would actually render carries a non-blank url string. Every other shape —
 * null, [], an entry with no url, a url that is an empty string or whitespace —
 * counts as no image.
 *
 * The entry checked is the one the card WOULD draw (is_cover first, then the
 * first row), not media[0] blindly. Testing index 0 while rendering the
 * is_cover entry is how a city ends up passing the filter and still drawing a
 * blank card.
 */
function coverUrl(media: unknown): string | null {
  if (!Array.isArray(media) || media.length === 0) return null;

  const entries = media.filter((m): m is GeoCityMedia => !!m && typeof m === 'object');
  const cover = entries.find((m) => m.is_cover) ?? entries[0];

  const url = cover?.url;
  return typeof url === 'string' && url.trim() !== '' ? url : null;
}

/**
 * Cities for the homepage "Explore cities" strip — IMAGE REQUIRED.
 *
 * A city with no photograph rendered as a grey gradient card with a name on it,
 * which read as a broken image rather than a design. Two of the twenty are in
 * that state (Afyon and Muğla, both media = []), so they are dropped here
 * rather than in the component: the strip never receives them, and there is no
 * hidden element left behind to add width to the horizontal scroller.
 *
 * WHY THE FILTER IS HERE AND NOT IN THE QUERY
 *   PostgREST can test a json path (media->0->>url), but only at a fixed index,
 *   and the rule above is not about index 0 — it is about whichever entry the
 *   card draws. A SQL filter and the render would then disagree for any city
 *   whose cover is not first. At twenty rows the saving is a rounding error and
 *   the divergence is a real bug, so the resolved value is what gets filtered.
 *
 * THIS DOES NOT TOUCH THE SEARCH FILTER. The city dropdown reads
 * getHostGeoData below, which is a different query with no image condition —
 * a city you can book in stays searchable whether or not we have a photo of it.
 */
export async function getCities(locale: string): Promise<CityData[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('geo_cities')
    .select('id, name, media, name_ar, name_en, name_tr')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[getCities]', error.message);
    return [];
  }

  const cities: CityData[] = [];
  for (const row of data ?? []) {
    const imageUrl = coverUrl(row.media);
    if (!imageUrl) continue;

    cities.push({
      id: row.id as string,
      name: row.name as string,
      localizedName: pickLocalizedName(locale, row) ?? (row.name as string),
      imageUrl,
    });
  }
  return cities;
}

// ── Host form geo data ─────────────────────────────────────────────────────────

export interface HostCity {
  id: string;
  name: string;          // canonical DB name — used when saving and when filtering
  localizedName: string; // display only, resolved for the caller's locale
  key: string;           // lowercase, e.g. "istanbul" (legacy i18n lookup key)
  hasDistricts: boolean;
}

export interface HostDistrict {
  id: string;
  name: string;
  localizedName: string;
  cityId: string;
}

export interface HostGeoData {
  cities: HostCity[];
  districtsByCityId: Record<string, HostDistrict[]>;
}

export async function getHostGeoData(locale: string = 'en'): Promise<HostGeoData> {
  const supabase = await createClient();

  // sort_order DESC puts Istanbul (=1) before the rest (=0), then alphabetical
  const { data: cityRows, error: cityErr } = await supabase
    .from('geo_cities')
    .select('id, name, name_ar, name_en, name_tr')
    .eq('is_active', true)
    .order('sort_order', { ascending: false })
    .order('name', { ascending: true });

  if (cityErr) {
    console.error('[getHostGeoData] cities:', cityErr.message);
    return { cities: [], districtsByCityId: {} };
  }

  const ids = (cityRows ?? []).map((c) => c.id as string);

  const { data: districtRows } = await supabase
    .from('geo_districts')
    .select('id, name, city_id, name_ar, name_en, name_tr')
    .eq('is_active', true)
    .in('city_id', ids)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  const districtsByCityId: Record<string, HostDistrict[]> = {};
  for (const d of districtRows ?? []) {
    const cid = d.city_id as string;
    if (!districtsByCityId[cid]) districtsByCityId[cid] = [];
    districtsByCityId[cid].push({
      id: d.id as string,
      name: d.name as string,
      localizedName: pickLocalizedName(locale, d) ?? (d.name as string),
      cityId: cid,
    });
  }

  const cities: HostCity[] = (cityRows ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    localizedName: pickLocalizedName(locale, c) ?? (c.name as string),
    key: (c.name as string).toLowerCase(),
    hasDistricts: !!(districtsByCityId[c.id as string]?.length),
  }));

  return { cities, districtsByCityId };
}
