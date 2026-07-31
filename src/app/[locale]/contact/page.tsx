import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { ContactForm } from '@/components/contact/ContactForm';
import { FadeUp } from '@/components/motion/FadeUp';
import { Link } from '@/i18n/navigation';
import { CANONICAL_URL, canonical, hreflangAlternates } from '@/lib/config/urls';


// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.contact' });

  const canonicalUrl = canonical(locale, '/contact');
  const title       = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates('/contact', 'en'),
    },
    openGraph: {
      title,
      description,
      url:  canonicalUrl,
      type: 'website',
      siteName: 'Homesta Stay',
    },
    twitter: {
      card:        'summary',
      title,
      description,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.contact' });

  // FAQ data for both render and JSON-LD
  const faqs = [
    { q: t('faq1Q'), a: t('faq1A') },
    { q: t('faq2Q'), a: t('faq2A') },
    { q: t('faq3Q'), a: t('faq3A') },
    { q: t('faq4Q'), a: t('faq4A') },
    { q: t('faq5Q'), a: t('faq5A') },
  ];

  // ── JSON-LD ──────────────────────────────────────────────────────────────

  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: t('metaTitle'),
    url: canonical(locale, '/contact'),
    mainEntity: {
      '@type': 'Organization',
      name: 'Homesta Stay',
      url: CANONICAL_URL,
      sameAs: [
        'https://www.instagram.com/homestastay',
        'https://www.facebook.com/share/1D7wLxSNzR/',
      ],
    },
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <main>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <FadeUp>
          <section className="px-4 pt-16 pb-12 max-w-2xl mx-auto text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute mb-5">
              homestastay.com
            </p>
            <h1 className="text-[clamp(2.25rem,8vw,3.5rem)] font-medium tracking-[-0.04em] leading-[0.93] text-ink mb-4">
              {t('heading')}
            </h1>
            <p className="text-base md:text-[19px] text-mute leading-relaxed">
              {t('subheading')}
            </p>
          </section>
        </FadeUp>

        {/* ── Form ──────────────────────────────────────────────────────────── */}
        <FadeUp delay={0.06}>
          <section className="max-w-2xl mx-auto px-4 pb-16">
            <h2 className="text-base font-medium text-ink tracking-[-0.015em] mb-6">
              {t('formTitle')}
            </h2>
            <ContactForm />
          </section>
        </FadeUp>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <FadeUp>
          <section
            className="max-w-3xl mx-auto px-4 pb-16"
            aria-labelledby="faq-heading"
          >
            <h2
              id="faq-heading"
              className="text-[1.1rem] font-medium text-ink tracking-[-0.02em] mb-2"
            >
              {t('faqTitle')}
            </h2>
            <dl>
              {faqs.map(({ q, a }, i) => (
                <div key={i} className="border-b border-rule py-5">
                  <dt className="text-sm font-medium text-ink mb-1.5">{q}</dt>
                  <dd className="text-sm text-ink-soft leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </FadeUp>

        {/* ── Internal links ─────────────────────────────────────────────────── */}
        <FadeUp>
          <section className="max-w-5xl mx-auto px-4 pb-20 flex flex-wrap items-center gap-3">
            <Link
              href="/host"
              className="inline-flex items-center gap-1.5 border border-rule rounded-[999px] px-5 py-2.5 text-sm font-medium text-ink-soft hover:text-ink hover:border-ink-soft transition-colors duration-[240ms]"
            >
              {t('listProperty')}
            </Link>
            <Link
              href="/stays"
              className="inline-flex items-center gap-1.5 border border-rule rounded-[999px] px-5 py-2.5 text-sm font-medium text-ink-soft hover:text-ink hover:border-ink-soft transition-colors duration-[240ms]"
            >
              {t('browseStays')}
            </Link>
          </section>
        </FadeUp>

      </main>
    </div>
  );
}
