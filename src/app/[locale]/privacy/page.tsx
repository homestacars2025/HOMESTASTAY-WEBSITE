import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/LegalPage';

const SITE = 'https://homestastay.com';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.privacy' });
  const canonical = `${SITE}/${locale}/privacy`;
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: `${SITE}/en/privacy`,
        ar: `${SITE}/ar/privacy`,
        tr: `${SITE}/tr/privacy`,
        ru: `${SITE}/ru/privacy`,
        'x-default': `${SITE}/en/privacy`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'Homesta Stay',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.privacy' });

  const sections = [
    { id: 'introduction',         title: t('s1Title'),  body: t('s1Body')  },
    { id: 'data-collected',       title: t('s2Title'),  body: t('s2Body')  },
    { id: 'how-we-use',           title: t('s3Title'),  body: t('s3Body')  },
    { id: 'legal-bases',          title: t('s4Title'),  body: t('s4Body')  },
    { id: 'cookies',              title: t('s5Title'),  body: t('s5Body')  },
    { id: 'sharing',              title: t('s6Title'),  body: t('s6Body')  },
    { id: 'international',        title: t('s7Title'),  body: t('s7Body')  },
    { id: 'retention',            title: t('s8Title'),  body: t('s8Body')  },
    { id: 'security',             title: t('s9Title'),  body: t('s9Body')  },
    { id: 'your-rights',          title: t('s10Title'), body: t('s10Body') },
    { id: 'children',             title: t('s11Title'), body: t('s11Body') },
    { id: 'policy-changes',       title: t('s12Title'), body: t('s12Body') },
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
      crossLinkHref="/terms"
      crossLinkPrefix={t('crossLinkPrefix')}
    />
  );
}
