import { getTranslations, getLocale } from 'next-intl/server';
import { getCities } from '@/lib/data/cities';
import { getCitySlugMap } from '@/lib/queries/destinations';
import { citySlug } from '@/lib/geo/city-slug';
import { CitiesScroller } from '@/components/home/CitiesScroller';

// Server component — fetches data, passes to the client CitiesScroller for animation.
export async function CitiesRow() {
  const locale = await getLocale();
  const [tSections, cities, slugs] = await Promise.all([
    getTranslations('sections'),
    // The city STRIP is display; the slug below is still derived from the
    // canonical `name`, so a localised label never changes a URL.
    getCities(locale),
    // The slug map is the single source of truth for destination URLs (curated
    // city_content.slug where it exists). The strip renders from geo_cities
    // because that is where the cover images live, so the two are joined on id
    // rather than each deriving a slug of its own.
    getCitySlugMap(),
  ]);

  // A city absent from v_city_live_stats (no units at all) still gets a link —
  // the derived slug resolves through the same fallback the route uses.
  const linked = cities.map((city) => ({
    ...city,
    slug: slugs.get(city.id) ?? citySlug(city.name),
  }));

  return (
    <section className="pb-10">
      <h2 className="px-4 mb-5 text-[19px] font-medium tracking-[-0.025em] text-ink">
        {tSections('cities')}
      </h2>
      <CitiesScroller cities={linked} />
    </section>
  );
}
