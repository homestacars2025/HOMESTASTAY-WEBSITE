import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { canonical, hreflangAlternates } from '@/lib/config/urls';


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.terms' });
  const canonicalUrl = canonical(locale, '/terms');
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates('/terms', 'en'),
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: 'Homesta Stay',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.terms' });

  const sections = [
    { id: 'acceptance',           title: t('s1Title'),  body: t('s1Body')  },
    { id: 'service',              title: t('s2Title'),  body: t('s2Body')  },
    { id: 'accounts',             title: t('s3Title'),  body: t('s3Body')  },
    { id: 'booking',              title: t('s4Title'),  body: t('s4Body')  },
    { id: 'intermediary',         title: t('s5Title'),  body: t('s5Body')  },
    { id: 'host-application',     title: t('s6Title'),  body: t('s6Body')  },
    { id: 'acceptable-use',       title: t('s7Title'),  body: t('s7Body')  },
    { id: 'intellectual-property',title: t('s8Title'),  body: t('s8Body')  },
    { id: 'disclaimers',          title: t('s9Title'),  body: t('s9Body')  },
    { id: 'cancellation',         title: t('s10Title'), body: t('s10Body') },
    { id: 'governing-law',        title: t('s11Title'), body: t('s11Body') },
    { id: 'changes',              title: t('s12Title'), body: t('s12Body') },
    { id: 'contact',              title: t('s13Title'), body: t('s13Body') },
  ];

  return (
    <LegalPage
      heading={t('heading')}
      lastUpdated={t('lastUpdated')}
      intro={t('intro')}
      tocTitle={t('tocTitle')}
      sections={sections}
      crossLinkLabel={t('crossLinkLabel')}
      crossLinkHref="/privacy"
      crossLinkPrefix={t('crossLinkPrefix')}
    />
  );
}
