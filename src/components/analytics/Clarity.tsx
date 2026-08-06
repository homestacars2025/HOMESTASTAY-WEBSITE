'use client';

import Script from 'next/script';
import { CLARITY_PROJECT_ID } from '@/lib/analytics/clarity';

/**
 * Microsoft Clarity tag.
 *
 * MOUNTED ONCE, in the root layout, beside the Meta Pixel. next/script
 * deduplicates by `id`, and Clarity's own snippet reuses `c[a]` if it already
 * exists — so a re-render cannot produce a second recorder.
 *
 * NO ROUTE-CHANGE HOOK, deliberately. Unlike a pixel's PageView, Clarity
 * follows SPA navigation by itself: it watches history and keeps one continuous
 * session across client-side routes. Firing anything per route here would
 * fragment the very recording it exists to produce.
 *
 * afterInteractive for the same reason as the pixel — a session recorder must
 * never compete with the page for the main thread (Law 1).
 *
 * NO <noscript> fallback exists, and none is possible: with JavaScript off
 * there is no session to record.
 */
export function Clarity() {
  if (!CLARITY_PROJECT_ID) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
    </Script>
  );
}
