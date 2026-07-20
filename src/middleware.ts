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
  // `api` MUST be excluded: next-intl otherwise 307-redirects /api/* to
  // /en/api/*. The Kuveyt Türk 3DS callback is a cross-site POST to
  // /api/payment/callback — a redirect drops the POST body and the callback
  // never runs, so a paid booking would look failed. (The route also lives
  // outside [locale], so the redirect target 404s regardless.)
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
