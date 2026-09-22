import { useTranslations } from 'next-intl';

/**
 * Loading placeholder for the stays listing — shown as the Suspense fallback
 * while a new search / page resolves, so the results area never freezes with no
 * feedback. Quiet and on-brand: paper-warm blocks with a soft pulse, matching
 * the UnitCard shape (4:3 cover + title/location/price lines).
 */

function SkeletonCard() {
  return (
    <div className="w-full">
      <div className="rounded-[14px] aspect-[4/3] mb-3 bg-paper-warm animate-pulse" />
      <div className="h-3.5 w-3/4 rounded bg-paper-warm animate-pulse mb-2" />
      <div className="h-2.5 w-1/2 rounded bg-paper-warm animate-pulse mb-2" />
      <div className="h-3   w-1/3 rounded bg-paper-warm animate-pulse" />
    </div>
  );
}

export function StaysSkeleton() {
  const t = useTranslations('pages.stays');

  return (
    <div aria-busy="true">
      {/* Announced to assistive tech; visually the pulsing cards do the talking. */}
      <span role="status" className="sr-only">{t('loadingResults')}</span>

      {/* Toolbar placeholder — same box as StaysToolbar (44px pills, then the
          count line), so the grid lands where it will stay. */}
      <div className="px-4 mb-6" aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <div className="h-11 w-28 rounded-[999px] bg-paper-warm animate-pulse" />
          <div className="h-11 w-40 rounded-[999px] bg-paper-warm animate-pulse" />
        </div>
        <div className="mt-4 h-[16px] flex items-center">
          <div className="h-2.5 w-20 rounded bg-paper-warm animate-pulse" />
        </div>
      </div>

      {/* Card grid placeholder — same columns as StaysGallery */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4"
        aria-hidden="true"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
