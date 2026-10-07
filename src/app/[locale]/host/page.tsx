import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Tag, Users, Zap } from 'lucide-react';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { Header } from '@/components/home/Header';
import { FadeUp } from '@/components/motion/FadeUp';
import { HostForm } from '@/components/host/HostForm';
import { HostApplicationStatus, type HostApplicationState } from '@/components/host/HostApplicationStatus';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { accountKind } from '@/lib/auth/account-role';
import { getHostGeoData } from '@/lib/data/cities';

// Listed in sitemap.xml but had no canonical and no hreflang. This is also the
// page owners search for ("list my property Istanbul"), so it is worth ranking
// on its own rather than as an untitled sibling of the homepage.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.host' });

  const canonicalUrl = canonical(locale, '/host');
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates('/host', 'en'),
    },
    openGraph: {
      title, description, url: canonicalUrl, type: 'website',
      siteName: SITE_NAME,
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      images: defaultOgImages(),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: defaultOgImages().map((i) => i.url),
    },
  };
}

const TRUST_POINTS = [
  { key: 'free',     Icon: Tag   },
  { key: 'guests',   Icon: Users },
  { key: 'bookings', Icon: Zap   },
] as const;

export default async function HostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const [t, geoData, applicant] = await Promise.all([
    getTranslations({ locale, namespace: 'pages.host' }),
    // Names come localised from geo_cities/geo_districts, so every city in the
    // table is covered rather than the six that had message keys.
    getHostGeoData(locale),
    readApplicant(),
  ]);

  const localizedCities = geoData.cities.map((c) => ({
    id:            c.id,
    name:          c.name,
    localizedName: c.localizedName,
    hasDistricts:  c.hasDistricts,
  }));

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-xl mx-auto px-4 pt-24 pb-20">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <FadeUp>
          <section className="mb-10">
            {/* Eyebrow badge */}
            <span className="inline-flex items-center rounded-[999px] border border-stay/30 bg-stay/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.09em] text-stay mb-5">
              {t('title')}
            </span>

            <h1 className="text-[clamp(1.9rem,6vw,2.75rem)] font-medium tracking-[-0.04em] leading-[1.0] text-ink mb-4">
              {t('headline')}
            </h1>

            <p className="text-base text-mute leading-relaxed mb-8">
              {t('subline')}
            </p>

            {/* Trust row */}
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {TRUST_POINTS.map(({ key, Icon }) => (
                <div key={key} className="flex items-center gap-2">
                  <Icon size={15} strokeWidth={1.75} className="text-stay shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium text-ink-soft">
                    {t(`trust.${key}`)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </FadeUp>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="h-px bg-rule mb-10" aria-hidden="true" />

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <FadeUp delay={0.06}>
          {applicant.kind === 'signed-out' ? (
            /* Applying needs an account: the application becomes this
               account's, and approval turns the same account into a host. */
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <h2 className="text-xl font-medium tracking-[-0.025em] text-ink">{t('signedOut.title')}</h2>
              <p className="text-sm text-ink-soft leading-relaxed max-w-sm">{t('signedOut.body')}</p>
              <div className="flex w-full max-w-sm flex-col gap-3 mt-2">
                <Link
                  href="/sign-up?returnUrl=%2Fhost"
                  className="inline-flex min-h-11 items-center justify-center rounded-[999px] bg-stay text-white text-sm font-medium px-6 py-3 transition-opacity duration-[240ms] hover:opacity-90"
                >
                  {t('signedOut.signUp')}
                </Link>
                <Link
                  href="/sign-in?returnUrl=%2Fhost"
                  className="inline-flex min-h-11 items-center justify-center rounded-[999px] border border-rule text-ink text-sm font-medium px-6 py-3 transition-colors duration-[240ms] hover:bg-paper-warm"
                >
                  {t('signedOut.signIn')}
                </Link>
              </div>
            </div>
          ) : applicant.kind === 'staff' ? (
            <p className="text-sm text-ink-soft leading-relaxed text-center py-6">{t('staffNote')}</p>
          ) : applicant.state ? (
            <HostApplicationStatus state={applicant.state} />
          ) : (
            <HostForm
              cities={localizedCities}
              districtsByCityId={geoData.districtsByCityId}
              prefill={applicant.prefill}
            />
          )}
        </FadeUp>

      </main>
    </div>
  );
}

type Applicant =
  | { kind: 'signed-out' }
  | { kind: 'staff' }
  | { kind: 'account'; state: HostApplicationState | null; prefill: { name: string; phone: string; email: string } };

/**
 * Who is looking at /host, and where their application stands.
 *
 * The page stays public (it is the hosts' landing page and is indexed); only
 * the form section depends on the visitor. my_host_application() is called as
 * the user — it answers for auth.uid() only. An owner is shown "approved"
 * without asking: the role is the answer.
 */
async function readApplicant(): Promise<Applicant> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: 'signed-out' };

  const kind = await accountKind(user.id);
  if (kind === 'team' || kind === 'admin' || kind === 'blocked') return { kind: 'staff' };

  const [{ data: profile }, application] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name, phone').eq('id', user.id).maybeSingle(),
    kind === 'owner' ? Promise.resolve(null) : supabase.rpc('my_host_application'),
  ]);

  let state: HostApplicationState | null = kind === 'owner' ? 'approved' : null;
  if (application) {
    if (application.error) {
      console.error('[host] my_host_application failed', { code: application.error.code, message: application.error.message });
    } else {
      const row = (Array.isArray(application.data) ? application.data[0] : application.data) as { status?: string } | null;
      const status = row?.status;
      if (status === 'under_review' || status === 'approved' || status === 'declined') state = status;
    }
  }

  const name = [profile?.first_name, profile?.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ');
  return {
    kind: 'account',
    state,
    prefill: { name, phone: typeof profile?.phone === 'string' ? profile.phone : '', email: user.email ?? '' },
  };
}
