'use client';

import { Suspense, useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { META_PIXEL_ID, trackPageView } from '@/lib/analytics/meta-pixel';

/**
 * Meta Pixel base code + SPA PageView tracking.
 *
 * MOUNTED ONCE, in the root layout. Two things guarantee it stays once:
 * next/script deduplicates by `id` across navigations, and Meta's own snippet
 * opens with `if (f.fbq) return;`. Re-rendering this component cannot produce a
 * second init or a second script tag.
 *
 * WHY afterInteractive
 *   The pixel must not compete with the page for the main thread — Law 1. Next
 *   injects it once hydration is done, which is early enough for accurate
 *   attribution and late enough to stay out of LCP's way.
 *
 * PAGEVIEW, EXACTLY ONCE PER VIEW
 *   The base snippet fires the first PageView itself, as Meta ships it. This
 *   app is a client-routed App Router site, so subsequent navigations never
 *   reload the document and would otherwise go uncounted. The effect below
 *   covers them — and deliberately SKIPS its first run, which would otherwise
 *   double-count the very first page. That skip is the whole trick; without it
 *   every session opens with two PageViews and every funnel number is wrong.
 */

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRun = useRef(true);

  useEffect(() => {
    // The base snippet already counted this one.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    trackPageView();
    // searchParams is part of the key on purpose: /stays?type=villas and
    // /stays?type=cabins are two different views of the catalogue to a guest,
    // and to Meta.
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel() {
  // No ID, no pixel. Keeps a misconfigured preview from initialising against
  // an empty property and polluting the real one with junk.
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>

      {/* useSearchParams() opts its subtree into client-side rendering, so it
          must sit behind a Suspense boundary — without one, every statically
          rendered page in the app (the legal pages) fails the build. */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>

      {/* Meta's <noscript> fallback, verbatim. next/image cannot be used here:
          a browser with JavaScript disabled must receive a plain <img>, and the
          whole point is a request with no scripting involved. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
