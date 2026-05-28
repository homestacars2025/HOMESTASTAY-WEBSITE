import { useTranslations } from 'next-intl';
import { Header } from '@/components/home/Header';
import { SearchBarWrapper } from '@/components/home/SearchBarWrapper';
import { CategoryChips } from '@/components/home/CategoryChips';
import { CitiesRow } from '@/components/home/CitiesRow';
import { UnitCard } from '@/components/home/UnitCard';
import { HeroDoodles } from '@/components/home/HeroDoodles';
import { WhyHomesta } from '@/components/home/WhyHomesta';
import { HowItWorks } from '@/components/home/HowItWorks';
import { FadeUp } from '@/components/motion/FadeUp';
import { MotionCard } from '@/components/motion/MotionCard';
import { FEATURED_UNITS, TOP_RATED_UNITS } from '@/lib/placeholder-data';

export default function HomePage() {
  const tHero     = useTranslations('hero');
  const tSections = useTranslations('sections');

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main>
        {/* ── Hero + Search (Istanbul line-art background) ─────── */}
        <div className="relative overflow-hidden">

          {/* Doodle wall — purely decorative, fades in to 13% opacity */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 z-0 hero-doodles-wrapper"
          >
            <HeroDoodles />
          </div>

          {/* Very soft centre glow — lets doodles show behind the text while keeping ink readable */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                'radial-gradient(ellipse 72% 62% at 50% 36%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.18) 55%, transparent 82%)',
            }}
          />

          {/* Headline */}
          <FadeUp>
            <section className="relative z-10 px-4 pt-20 pb-12 max-w-2xl mx-auto text-center">
              <h1 className="text-[clamp(2.25rem,8vw,3.75rem)] font-medium tracking-[-0.04em] leading-[0.93] text-ink mb-5">
                {tHero('headline')}
              </h1>
              <p className="text-base md:text-[19px] text-mute leading-relaxed max-w-sm mx-auto">
                {tHero('subline')}
              </p>
            </section>
          </FadeUp>

          {/* Search bar */}
          <FadeUp delay={0.06}>
            <section className="relative z-10 px-4 pb-10 max-w-md md:max-w-2xl mx-auto">
              <SearchBarWrapper />
            </section>
          </FadeUp>

        </div>

        {/* ── Category chips ───────────────────────────────────── */}
        <FadeUp delay={0.10}>
          <section className="pb-10">
            <CategoryChips />
          </section>
        </FadeUp>

        {/* ── Explore cities ───────────────────────────────────── */}
        <FadeUp>
          <CitiesRow />
        </FadeUp>

        {/* ── Why Homesta ──────────────────────────────────────── */}
        <WhyHomesta />

        {/* ── Featured stays ───────────────────────────────────── */}
        <FadeUp>
          <section className="pb-12">
            <h2 className="px-4 mb-5 text-[19px] font-medium tracking-[-0.025em] text-ink">
              {tSections('featured')}
            </h2>
            {/* Horizontal scroll — cards peek off edge to signal more */}
            <div
              className="flex gap-4 overflow-x-auto px-4 pb-3 scrollbar-none"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {FEATURED_UNITS.map((unit) => (
                <MotionCard key={unit.id} className="flex-none w-[260px] md:w-[280px]">
                  <UnitCard unit={unit} />
                </MotionCard>
              ))}
              <div className="w-1 shrink-0" aria-hidden="true" />
            </div>
          </section>
        </FadeUp>

        {/* ── How it works ─────────────────────────────────────── */}
        <HowItWorks />

        {/* ── Top rated ────────────────────────────────────────── */}
        <FadeUp>
          <section className="pb-24">
            <h2 className="px-4 mb-5 text-[19px] font-medium tracking-[-0.025em] text-ink">
              {tSections('topRated')}
            </h2>
            <div
              className="flex gap-4 overflow-x-auto px-4 pb-3 scrollbar-none"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {TOP_RATED_UNITS.map((unit) => (
                <MotionCard key={unit.id} className="flex-none w-[260px] md:w-[280px]">
                  <UnitCard unit={unit} />
                </MotionCard>
              ))}
              <div className="w-1 shrink-0" aria-hidden="true" />
            </div>
          </section>
        </FadeUp>
      </main>
    </div>
  );
}
