'use client';

import { useRef, type ComponentProps } from 'react';
import { Link, useRouter } from '@/i18n/navigation';

/**
 * A Link that prefetches on intent — hover, touch or keyboard focus — instead
 * of on entering the viewport.
 *
 * For grids that re-render in place (the /stays category chips): a viewport
 * prefetch there would fire a request for every card a chip brings on
 * screen, and a chip tap must cost no network at all. Intent still gives the
 * unit page a head start of the hover/press before the click lands.
 */
export function IntentLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, 'prefetch'> & { href: string }) {
  const router = useRouter();
  const done = useRef(false);

  function warm() {
    if (done.current) return;
    done.current = true;
    router.prefetch(href);
  }

  return (
    <Link
      {...rest}
      href={href as '/stays/[slug]'}
      prefetch={false}
      onMouseEnter={warm}
      onTouchStart={warm}
      onFocus={warm}
    />
  );
}
