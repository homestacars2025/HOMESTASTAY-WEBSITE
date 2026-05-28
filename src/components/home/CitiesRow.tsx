import { getTranslations } from 'next-intl/server';
import { getCities } from '@/lib/data/cities';
import { CitiesScroller } from '@/components/home/CitiesScroller';

// Server component — fetches data, passes to the client CitiesScroller for animation.
export async function CitiesRow() {
  const [tSections, cities] = await Promise.all([
    getTranslations('sections'),
    getCities(),
  ]);

  return (
    <section className="pb-10">
      <h2 className="px-4 mb-5 text-[19px] font-medium tracking-[-0.025em] text-ink">
        {tSections('cities')}
      </h2>
      <CitiesScroller cities={cities} />
    </section>
  );
}
