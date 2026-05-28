import { getTranslations, getLocale } from 'next-intl/server';
import { getHostGeoData } from '@/lib/data/cities';
import { SearchBar } from '@/components/home/SearchBar';

const CITY_KEYS = ['istanbul', 'trabzon', 'sapanca', 'antalya', 'fethiye', 'bodrum'] as const;
type CityKey = typeof CITY_KEYS[number];

export async function SearchBarWrapper() {
  const [tCities, geoData] = await Promise.all([
    getTranslations('cities'),
    getHostGeoData(),
  ]);

  const cities = geoData.cities.map((c) => ({
    id: c.id,
    name: c.name,
    localizedName: CITY_KEYS.includes(c.key as CityKey)
      ? tCities(c.key as CityKey)
      : c.name,
  }));

  return <SearchBar cities={cities} />;
}
