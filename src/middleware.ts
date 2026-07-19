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
  matcher: [
    // `onay` and `ret` are the owner decision links sent over WhatsApp. They are
    // Turkish-only by design and must stay at the bare path — routing.localePrefix
    // is 'always', so without this exclusion next-intl would 307 /onay/{token} to
    // /en/onay/{token}, breaking every link in an already-approved Meta template.
    // They also never carry a Supabase session, so the auth refresh below is moot.
    '/((?!_next|_vercel|onay|ret|.*\\..*).*)',
  ],
};
