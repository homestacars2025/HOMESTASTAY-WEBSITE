import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarSync, Copy, FileDown, HandCoins, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { HOST_GUIDE_PDF_URL, TURSAB_LICENSE_NO } from '@/lib/config/host';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { Header } from '@/components/home/Header';
import { FadeUp } from '@/components/motion/FadeUp';
import { HostForm } from '@/components/host/HostForm';
import { HostApplicationStatus, type HostApplicationState } from '@/components/host/HostApplicationStatus';
import { createClient } from '@/lib/supabase/server';
import { HOSTS_WHATSAPP } from '@/lib/config/social';
import { accountKind } from '@/lib/auth/account-role';
import { getHostGeoData } from '@/lib/data/cities';
import { cookies } from 'next/headers';
import { Link } from '@/i18n/navigation';
import { BecomeHostCta } from '@/components/host/BecomeHostCta';
import { HOST_INTENT_COOKIE } from '@/lib/host/self-serve';

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

/** One line each, above the button. The Airbnb import gets its own card. */
const BENEFITS = [
  { key: 'free',      Icon: HandCoins       },
  { key: 'dashboard', Icon: LayoutDashboard },
  { key: 'sync',      Icon: CalendarSync    },
] as const;

/**
 * "List your property" — self-serve first (decision 2026-11-17).
 *
 * One action: Become a host (components/host/BecomeHostCta → become_host →
 * the portal's add-a-unit wizard). The old lead form is kept, unchanged, one
 * small link away ("Want help listing? Leave your number" → ?help=1).
 */
export default async function HostPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ help?: string; start?: string }>;
}) {
  const { locale } = await params;
  const { help, start } = await searchParams;
  const showHelp = help === '1';

  const [t, geoData, applicant, jar] = await Promise.all([
    getTranslations({ locale, namespace: 'pages.host' }),
    // Names come localised from geo_cities/geo_districts, so every city in the
    // table is covered rather than the six that had message keys. Only the
    // help form needs them.
    showHelp ? getHostGeoData(locale) : Promise.resolve({ cities: [], districtsByCityId: {} }),
    readApplicant(),
    cookies(),
  ]);
  // Back from sign-up: finish by itself, but only in the browser that tapped.
  const autoStart = start === '1' && applicant.kind === 'account' && !applicant.owner
    && jar.get(HOST_INTENT_COOKIE)?.value === '1';
  const ctaMode = applicant.kind === 'signed-out' ? 'signed-out' : applicant.kind === 'account' && applicant.owner ? 'owner' : 'customer';
  // Turnstile guards the public form (the server fails closed without it).
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  // Straight back from the email code: no page to read, no tap — just the
  // hand-off (become_host → portal) behind a quiet "opening…" line.
  if (autoStart) {
    return (
      <div className="min-h-screen bg-paper">
        <Header />
        <main className="max-w-xl mx-auto px-4 pt-32 pb-20">
          <BecomeHostCta mode="customer" autoStart />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-xl mx-auto px-4 pt-24 pb-20">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <FadeUp>
          <section className="mb-8">
            {/* Eyebrow badge */}
            <span className="inline-flex items-center rounded-[999px] border border-stay/30 bg-stay/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.09em] text-stay mb-5">
              {t('title')}
            </span>

            <h1 className="text-[clamp(1.9rem,6vw,2.75rem)] font-medium tracking-[-0.04em] leading-[1.0] text-ink mb-4">
              {t('headline')}
            </h1>

            <p className="text-base text-mute leading-relaxed">
              {t('subline')}
            </p>
          </section>
        </FadeUp>

        {/* ── Benefits ─────────────────────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <ul className="mb-4 flex flex-col gap-4">
            {BENEFITS.map(({ key, Icon }) => (
              <li key={key} className="flex items-start gap-3">
                <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
                <span className="text-[15px] leading-snug text-ink-soft">{t(`benefits.${key}`)}</span>
              </li>
            ))}
          </ul>
          {/* The Airbnb import — the one that saves the most time, so it stands out. */}
          <div className="mb-8 flex items-start gap-3 rounded-[14px] border border-rule bg-paper-warm p-4">
            <Copy size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
            <p className="text-[15px] leading-snug text-ink">{t('benefits.airbnb')}</p>
          </div>
        </FadeUp>

        {/* ── The one action ───────────────────────────────────────────── */}
        <FadeUp delay={0.06}>
          {applicant.kind === 'staff' ? (
            <p className="text-sm text-ink-soft leading-relaxed text-center py-6">{t('staffNote')}</p>
          ) : (
            <section aria-label={t('become.cta')} className="flex flex-col items-stretch gap-2 sm:items-start">
              <BecomeHostCta mode={ctaMode} autoStart={false} />
              {ctaMode !== 'owner' && (
                <p className="text-center text-sm text-mute sm:text-start">{t('become.free')}</p>
              )}
            </section>
          )}
        </FadeUp>

        {/* ── Trust: TÜRSAB licence + the host guide (each only once known) ── */}
        {(TURSAB_LICENSE_NO || HOST_GUIDE_PDF_URL) && (
          <section className="mt-10 flex flex-col gap-4 border-t border-rule pt-8">
            {TURSAB_LICENSE_NO && (
              <div className="flex items-start gap-3">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[999px] border border-ink/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink">
                  <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                  TÜRSAB
                </span>
                <p className="text-sm leading-snug text-ink-soft">{t('trust.tursab', { number: TURSAB_LICENSE_NO })}</p>
              </div>
            )}
            {HOST_GUIDE_PDF_URL && (
              <a
                href={HOST_GUIDE_PDF_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center justify-center gap-2 self-stretch rounded-[999px] border border-rule px-6 text-sm font-medium text-ink transition-colors duration-[240ms] hover:bg-paper-warm sm:self-start"
              >
                <FileDown size={16} strokeWidth={1.75} aria-hidden="true" />
                {t('guide')}
              </a>
            )}
          </section>
        )}

        {/* ── Secondary: the old lead form, unchanged ───────────────────── */}
        {applicant.kind !== 'staff' && ctaMode !== 'owner' && (
          <div id="help" className="mt-12 scroll-mt-24">
            {!showHelp ? (
              <Link
                href={{ pathname: '/host', query: { help: '1' }, hash: 'help' }}
                className="text-sm text-ink-soft underline underline-offset-4 transition-colors duration-[240ms] hover:text-ink"
              >
                {t('become.helpLink')}
              </Link>
            ) : (
              <>
                <div className="h-px bg-rule mb-10" aria-hidden="true" />
                <h2 className="mb-6 text-lg font-medium tracking-[-0.025em] text-ink">{t('become.helpTitle')}</h2>
                {applicant.kind === 'account' && applicant.state ? (
                  <HostApplicationStatus state={applicant.state} />
                ) : (
                  /* Open to everyone — no account needed. A signed-in
                     visitor's lead is linked to their account on the server. */
                  <HostForm
                    cities={geoData.cities.map((c) => ({
                      id:            c.id,
                      name:          c.name,
                      localizedName: c.localizedName,
                      hasDistricts:  c.hasDistricts,
                    }))}
                    districtsByCityId={geoData.districtsByCityId}
                    prefill={applicant.kind === 'account' ? applicant.prefill : EMPTY_PREFILL}
                    signedIn={applicant.kind === 'account'}
                    siteKey={siteKey}
                    hostsWhatsapp={HOSTS_WHATSAPP}
                  />
                )}
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

const EMPTY_PREFILL = { name: '', phone: '', email: '' };

type Applicant =
  | { kind: 'signed-out' }
  | { kind: 'staff' }
  | { kind: 'account'; owner: boolean; state: HostApplicationState | null; prefill: { name: string; phone: string; email: string } };

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
    owner: kind === 'owner',
    state,
    prefill: { name, phone: typeof profile?.phone === 'string' ? profile.phone : '', email: user.email ?? '' },
  };
}
