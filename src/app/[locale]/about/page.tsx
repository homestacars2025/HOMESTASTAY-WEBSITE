import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  BadgeCheck, Zap, Eye, Languages, ShieldCheck,
  LayoutGrid, CalendarClock, Wallet, CalendarX, SlidersHorizontal, Percent,
  ArrowUpRight, Mail, Building2,
} from 'lucide-react';
import { Header } from '@/components/home/Header';
import { SiteFooter } from '@/components/home/SiteFooter';
import { FadeUp } from '@/components/motion/FadeUp';
import { JsonLd } from '@/components/seo/JsonLd';
import { Link } from '@/i18n/navigation';
import { CANONICAL_URL, canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { breadcrumbSchema, graph, organizationSchema, ORG_ID } from '@/lib/seo/schema';
import { CONTACT_EMAIL } from '@/lib/config/social';
import { COMPANY } from '@/lib/config/company';

/**
 * About — the page the footer has linked to since launch and that has been
 * answering 404 the whole time.
 *
 * SERVER-RENDERED PROSE, WHICH IS THE POINT (Law 3). Everything here is in the
 * HTML that arrives: an answer engine that runs no JavaScript still reads who
 * we are, what the two owner models cost, and that Homesta Cars is the same
 * group. That is exactly the kind of factual, liftable block a generative
 * engine cites, and it is why there is not a single Client Component below.
 *
 * ⚠️ EVERY NUMBER ON THIS PAGE IS OWNER-MAINTAINED AND DELIBERATELY COARSE —
 * 20%, 50 platforms, 100 cars, 10 agencies, four languages, two branches. No
 * property count and no figure that goes stale on its own: a number nobody
 * updates becomes a lie on a page whose whole job is trust.
 */

const PATH = '/about';
const CARS_URL = 'https://homestacars.com';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.about' });

  const url = canonical(locale, PATH);
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical: url,
      // All four locales plus x-default. A page that exists in four languages
      // and says so is the difference between one indexed page and four.
      languages: hreflangAlternates(PATH, 'en'),
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: SITE_NAME,
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      images: defaultOgImages(),
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.about' });

  const url = canonical(locale, PATH);

  // ── JSON-LD ───────────────────────────────────────────────────────────────
  // One @graph rather than three loose scripts, so the AboutPage, the
  // Organization and the breadcrumb are one connected statement instead of
  // three that a parser has to guess are related.
  //
  // organizationSchema() is reused verbatim — legal name, MERSIS, tax id,
  // address, contact point and social profiles all come from the same config
  // the footer and the distance-selling contracts read. A second hand-written
  // Organization here would be a second version of the company's identity,
  // free to drift from the legally-binding one.
  const org = {
    ...organizationSchema(locale),
    parentOrganization: { '@type': 'Organization', name: 'Homesta Group' },
    // Homesta Cars belongs beside the social profiles: it is the same group,
    // and sameAs is how a knowledge graph learns two properties are one entity.
    sameAs: [
      ...((organizationSchema(locale) as { sameAs?: string[] }).sameAs ?? []),
      CARS_URL,
    ],
  };

  const aboutLd = {
    '@type': 'AboutPage',
    '@id': `${url}#about`,
    url,
    name: t('metaTitle'),
    description: t('metaDescription'),
    inLanguage: locale,
    isPartOf: { '@id': `${CANONICAL_URL}/#website` },
    about: { '@id': ORG_ID },
    // The opening paragraph, verbatim. A generative engine quoting this page
    // should quote the sentence we actually wrote.
    abstract: t('intro'),
  };

  const breadcrumb = breadcrumbSchema([
    { name: SITE_NAME, url: canonical(locale, '') },
    { name: t('eyebrow'), url },
  ]);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <JsonLd data={graph(aboutLd, org, breadcrumb)} />

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <FadeUp>
          <section className="mx-auto max-w-3xl px-4 pt-16 pb-14 text-center md:pt-24 md:pb-20">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
              {t('eyebrow')}
            </p>
            {/* The one <h1> on the page. */}
            <h1 className="text-[clamp(2.1rem,7.5vw,3.5rem)] font-medium leading-[0.95] tracking-[-0.045em] text-ink">
              {t('heading')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-soft md:text-[19px]">
              {t('intro')}
            </p>
          </section>
        </FadeUp>

        {/* ── Mission ────────────────────────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <section className="mx-auto max-w-3xl px-4 pb-16 md:pb-20">
            <div className="rounded-[14px] border border-rule bg-paper-warm px-6 py-8 md:px-10 md:py-10">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">
                {t('missionTitle')}
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink md:text-lg">
                {t('missionBody')}
              </p>
            </div>
          </section>
        </FadeUp>

        {/* ── Why Homesta ────────────────────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <Section title={t('whyTitle')}>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              <Feature icon={<BadgeCheck />} title={t('why.verifiedTitle')} body={t('why.verifiedBody')} />
              <Feature icon={<Zap />} title={t('why.instantTitle')} body={t('why.instantBody')} />
              <Feature icon={<Eye />} title={t('why.clearTitle')} body={t('why.clearBody')} />
              <Feature icon={<Languages />} title={t('why.supportTitle')} body={t('why.supportBody')} />
              <Feature icon={<ShieldCheck />} title={t('why.payTitle')} body={t('why.payBody')} />
            </ul>
          </Section>
        </FadeUp>

        {/* ── Markets ────────────────────────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <Section title={t('marketsTitle')}>
            <p className="max-w-2xl text-[17px] leading-relaxed text-ink-soft">
              {t('marketsBody')}
            </p>
          </Section>
        </FadeUp>

        {/* ── For owners: the two models ─────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <Section title={t('ownersTitle')} lead={t('ownersLead')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
              <OwnerCard
                title={t('owners.directTitle')}
                badge={t('owners.directBadge')}
                body={t('owners.directBody')}
                /* The accent marks the recommended path — Law 4 allows it for
                   an active/primary state, and this is the one most owners
                   should take. */
                highlight
              />
              <OwnerCard
                title={t('owners.managedTitle')}
                badge={t('owners.managedBadge')}
                body={t('owners.managedBody')}
              />
            </div>
          </Section>
        </FadeUp>

        {/* ── Owner dashboard ────────────────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <Section title={t('dashboardTitle')} lead={t('dashboardLead')}>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Perk icon={<LayoutGrid />} label={t('dashboard.listing')} />
              <Perk icon={<CalendarClock />} label={t('dashboard.bookings')} />
              <Perk icon={<Wallet />} label={t('dashboard.finance')} />
              <Perk icon={<CalendarX />} label={t('dashboard.calendar')} />
              <Perk icon={<SlidersHorizontal />} label={t('dashboard.pricing')} />
              <Perk icon={<Percent />} label={t('dashboard.discounts')} />
            </ul>
          </Section>
        </FadeUp>

        {/* ── Homesta Group — the one dark section on the page ────────────── */}
        {/* Ink, not white: §7 keeps a dark surface for a moment that should
            read as a different register, and the parent group is exactly that.
            It also stops the Homesta Cars link from looking like one more row
            in a long white page. */}
        <FadeUp delay={0.04}>
          <section className="bg-ink px-4 py-16 text-white md:py-24">
            <div className="mx-auto max-w-3xl">
              <p className="mb-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/55">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                {t('groupTitle')}
              </p>
              <p className="text-[19px] leading-relaxed text-white md:text-[22px]">
                {t('groupBody')}
              </p>
              <p className="mt-5 text-[15px] leading-relaxed text-white/70">
                {t('groupBranches')}
              </p>

              {/* External, so a plain <a> rather than the locale-aware Link —
                  homestacars.com has its own routing and no locale prefix of
                  ours. rel="noopener" is mandatory with target="_blank". */}
              <a
                href={CARS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-9 inline-flex min-h-[44px] items-center gap-2 rounded-[999px] bg-white px-7 py-3.5 text-sm font-semibold text-ink transition-opacity duration-[240ms] hover:opacity-90"
              >
                {t('groupCta')}
                {/* Mirrors in Arabic so the arrow always points "away". */}
                <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              </a>
            </div>
          </section>
        </FadeUp>

        {/* ── Partnerships ───────────────────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <Section title={t('partnersTitle')}>
            <p className="max-w-2xl text-[17px] leading-relaxed text-ink-soft">
              {t('partnersBody')}
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-6 inline-flex items-center gap-2 text-[15px] font-medium text-stay underline underline-offset-4 transition-opacity duration-[240ms] hover:opacity-80"
            >
              <Mail className="h-4 w-4" aria-hidden />
              {t('partnersCta')} — {CONTACT_EMAIL}
            </a>
          </Section>
        </FadeUp>

        {/* ── Contact ────────────────────────────────────────────────────── */}
        <FadeUp delay={0.04}>
          <section className="mx-auto max-w-3xl px-4 pb-24 text-center md:pb-32">
            <h2 className="text-[clamp(1.5rem,4.5vw,2.25rem)] font-medium tracking-[-0.035em] text-ink">
              {t('contactTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-mute">
              {t('contactBody')}
            </p>
            <Link
              href="/contact"
              className="mt-7 inline-flex min-h-[44px] items-center justify-center rounded-[999px] bg-stay px-8 py-3.5 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90"
            >
              {t('contactCta')}
            </Link>
            {/* The legal identity, quietly. It is already in the footer; here it
                gives an answer engine the entity on the page it is reading. */}
            <p className="mt-8 font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-mute">
              {COMPANY.legalName}
            </p>
          </section>
        </FadeUp>
      </main>

      <SiteFooter />
    </div>
  );
}

// ── Layout pieces ─────────────────────────────────────────────────────────────
// All server components: nothing on this page is interactive, so nothing here
// reaches the browser as JavaScript.

function Section({
  title, lead, children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 md:pb-24">
      <h2 className="text-[clamp(1.4rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink">
        {title}
      </h2>
      {lead && (
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-mute">{lead}</p>
      )}
      <div className="mt-8 md:mt-10">{children}</div>
    </section>
  );
}

/** An icon + heading + sentence. `items-start` and `gap` are direction-agnostic. */
function Feature({
  icon, title, body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-4">
      <span
        className="mt-[2px] flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stay/8 text-stay [&>svg]:h-[18px] [&>svg]:w-[18px]"
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-medium leading-snug text-ink">{title}</span>
        <span className="text-[14px] leading-relaxed text-mute">{body}</span>
      </span>
    </li>
  );
}

/** A one-line dashboard capability. Tighter than Feature — no body copy. */
function Perk({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule text-ink-soft [&>svg]:h-4 [&>svg]:w-4"
        aria-hidden
      >
        {icon}
      </span>
      <span className="text-[15px] leading-snug text-ink">{label}</span>
    </li>
  );
}

function OwnerCard({
  title, badge, body, highlight = false,
}: {
  title: string;
  badge: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <article
      className={
        'flex flex-col rounded-[14px] border p-6 md:p-8 ' +
        (highlight ? 'border-stay bg-paper-warm' : 'border-rule bg-white')
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[19px] font-medium tracking-[-0.02em] text-ink">{title}</h3>
        <span
          className={
            'rounded-[999px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ' +
            (highlight ? 'bg-stay text-white' : 'border border-rule text-mute')
          }
        >
          {badge}
        </span>
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{body}</p>
    </article>
  );
}
