import { createClient } from '@/lib/supabase/server';

interface GeoCityMedia {
  url: string;
  is_cover?: boolean;
  sort_order?: number;
}

export interface CityData {
  id: string;
  name: string;
  imageUrl: string | null;
}

export async function getCities(): Promise<CityData[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('geo_cities')
    .select('id, name, media')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[getCities]', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const media: GeoCityMedia[] = Array.isArray(row.media) ? row.media : [];
    const cover = media.find((m) => m.is_cover) ?? media[0] ?? null;
    return {
      id: row.id as string,
      name: row.name as string,
      imageUrl: cover?.url ?? null,
    };
  });
}

// ── Host form geo data ─────────────────────────────────────────────────────────

export interface HostCity {
  id: string;
  name: string;        // English DB name — used when saving
  key: string;         // lowercase for i18n lookup, e.g. "istanbul"
  hasDistricts: boolean;
}

export interface HostDistrict {
  id: string;
  name: string;
  cityId: string;
}

export interface HostGeoData {
  cities: HostCity[];
  districtsByCityId: Record<string, HostDistrict[]>;
}

export async function getHostGeoData(): Promise<HostGeoData> {
  const supabase = await createClient();

  // sort_order DESC puts Istanbul (=1) before the rest (=0), then alphabetical
  const { data: cityRows, error: cityErr } = await supabase
    .from('geo_cities')
    .select('id, name')
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
    .select('id, name, city_id')
    .eq('is_active', true)
    .in('city_id', ids)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  const districtsByCityId: Record<string, HostDistrict[]> = {};
  for (const d of districtRows ?? []) {
    const cid = d.city_id as string;
    if (!districtsByCityId[cid]) districtsByCityId[cid] = [];
    districtsByCityId[cid].push({ id: d.id as string, name: d.name as string, cityId: cid });
  }

  const cities: HostCity[] = (cityRows ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    key: (c.name as string).toLowerCase(),
    hasDistricts: !!(districtsByCityId[c.id as string]?.length),
  }));

  return { cities, districtsByCityId };
}
