import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/brand/BrandMark';
import { SaveButton } from '@/components/home/SaveButton';
import { SampleBadge } from '@/components/shared/SampleBadge';
import { Link } from '@/i18n/navigation';
import type { UnitListing } from '@/lib/types/unit';

interface UnitCardProps {
  unit: UnitListing;
  /** Override width/flex classes. Defaults to w-full (for grid use).
   *  Pass e.g. "flex-none w-[260px] md:w-[280px]" for horizontal scroll. */
  className?: string;
}

export function UnitCard({ unit, className }: UnitCardProps) {
  const t = useTranslations('card');
  const tSample = useTranslations('sample');

  const cover = unit.media.find((m) => m.is_cover) ?? unit.media[0];
  const title = unit.ad_title ?? unit.unit_name ?? '—';
  const district = unit.region ?? unit.municipality ?? '';

  return (
    <Link href={`/stays/${unit.id}` as '/stays/[id]'} className={cn('block cursor-pointer group', className ?? 'w-full')}>
      <article>
        {/* Image */}
        <div className="relative rounded-[14px] overflow-hidden aspect-[4/3] mb-3">
          {cover ? (
            <Image
              src={cover.public_url}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover transition-transform duration-[240ms] group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 bg-paper-warm" />
          )}
          {unit.is_sample && (
            <SampleBadge className="absolute top-3 start-3 z-10" />
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
            {unit.is_sample ? (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-mute pt-0.5">
                {tSample('new')}
              </span>
            ) : (
              unit.rating !== null && (
                <div className="flex items-center gap-0.5 shrink-0 text-ink-soft text-xs pt-0.5">
                  <BrandMark className="w-[11px] h-[11px]" />
                  <span className="tabular-nums">{unit.rating.toFixed(2)}</span>
                </div>
              )
            )}
          </div>

          {/* Location */}
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute mb-1">
            {district}{district && unit.city ? ' · ' : ''}{unit.city}
          </p>

          {/* Price — hidden entirely when the host hasn't set a nightly price */}
          {unit.base_nightly_price !== null && (
            <p className="text-sm">
              <span className="font-semibold text-stay">${unit.base_nightly_price}</span>
              <span className="text-mute text-xs"> {t('perNight')}</span>
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}
