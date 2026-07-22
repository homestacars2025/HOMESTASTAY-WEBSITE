import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Run next-intl locale detection/redirect first
  const response = intlMiddleware(request);

  // Refresh Supabase session token if it has expired, writing updated cookies onto the response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Required by @supabase/ssr: refreshes and persists the session
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Exclusions, each load-bearing:
  //  - `api`: next-intl otherwise 307-redirects /api/* to /en/api/*, dropping
  //    the body of the Kuveyt Türk 3DS callback (a cross-site POST) so a paid
  //    booking looks failed.
  //  - `icon`, `apple-icon`, `opengraph-image`, `twitter-image`: App Router
  //    metadata routes, dotless so NOT caught by the .*\..* rule. Without this
  //    the <link rel="icon" href="/icon"> in every page 307-redirects to
  //    /en/icon and the favicon never loads — the browser tab stays blank.
  //  - Dotted metadata files (favicon.ico, manifest.webmanifest, sitemap.xml,
  //    robots.txt) are already excluded by the .*\..* segment.
  matcher: [
    '/((?!api|_next|_vercel|icon|apple-icon|opengraph-image|twitter-image|.*\\..*).*)',
  ],
};
