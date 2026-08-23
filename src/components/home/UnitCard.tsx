import { useTranslations, useLocale } from 'next-intl';
import { SmartImage } from '@/components/media/SmartImage';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/brand/BrandMark';
import { SaveButton } from '@/components/home/SaveButton';
import { Link } from '@/i18n/navigation';
import type { UnitListing } from '@/lib/types/unit';
import { formatPlace } from '@/lib/geo/localize';

interface UnitCardProps {
  unit: UnitListing;
  /** Override width/flex classes. Defaults to w-full (for grid use).
   *  Pass e.g. "flex-none w-[260px] md:w-[280px]" for horizontal scroll. */
  className?: string;
  /** Encoded checkIn/checkOut/guests carried from the search, so the unit page
   *  preselects them instead of making the guest re-pick. '' when absent. */
  searchQuery?: string;
}

export function UnitCard({ unit, className, searchQuery }: UnitCardProps) {
  const t = useTranslations('card');
  const locale = useLocale();

  const cover = unit.media.find((m) => m.is_cover) ?? unit.media[0];
  const title = unit.ad_title ?? unit.unit_name ?? '—';
  // One formatter for every surface: "District, City", or just the city when
  // the unit has no district — which is 126 of the 146 properties, so the
  // no-district case is the normal one and must not print a stray separator.
  const place = formatPlace(locale, unit.region ?? unit.municipality, unit.city);

  // Live-resolved. total/nights are present only when the search carried dates.
  const { nightly_usd: nightlyUsd, total_usd: totalUsd, nights } = unit.pricing;

  const href =
    `/stays/${unit.slug ?? unit.id}${searchQuery ? `?${searchQuery}` : ''}`;

  return (
    <Link href={href as '/stays/[slug]'} className={cn('block cursor-pointer group', className ?? 'w-full')}>
      <article>
        {/* Image */}
        {/* aspect-[4/3] reserves the box before the photo arrives, so nothing
            below it moves when the image lands. bg-paper-warm is what the fade
            in SmartImage resolves FROM — brand surface, not white void. */}
        <div className="relative rounded-[14px] overflow-hidden aspect-[4/3] mb-3 bg-paper-warm">
          {cover ? (
            <SmartImage
              src={cover.public_url}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover transition-transform duration-[240ms] group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 bg-paper-warm" />
          )}
          <SaveButton unitId={unit.id} />
        </div>

        {/* Info */}
        <div>
          {/* Title + rating */}
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-1 flex-1">
              {title}
            </h3>
            {unit.rating !== null && (
              <div className="flex items-center gap-0.5 shrink-0 text-ink-soft text-xs pt-0.5">
                <BrandMark className="w-[11px] h-[11px]" />
                <span className="tabular-nums">{unit.rating.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Location */}
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute mb-1">
            {place}
          </p>

          {/* Price — resolved live, hidden entirely when the unit has no price.
              When the search carried dates the total is the resolver's SUM over
              the stay, so the grid and the detail page can never disagree. */}
          {nightlyUsd !== null && (
            <>
              <p className="text-sm">
                <span className="font-semibold text-stay">${nightlyUsd}</span>
                <span className="text-mute text-xs"> {t('perNight')}</span>
              </p>
              {totalUsd !== null && nights !== null && (
                <p className="text-xs text-mute mt-0.5">
                  ${totalUsd} {t('total')} · {t('nights', { count: nights })}
                </p>
              )}
            </>
          )}
        </div>
      </article>
    </Link>
  );
}
