import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage';
import { getLegalDoc } from '@/content/legal';
import { DOCUMENT_VERSION } from '@/lib/booking/documents';
import { canonical, hreflangAlternates } from '@/lib/config/urls';

/**
 * Mesafeli Satış Sözleşmesi — the distance sales contract.
 *
 * No annex: the booking summary is an annex to the Ön Bilgilendirme Formu,
 * not to this contract. Keeping them distinct matters, because the two
 * documents are accepted and recorded separately.
 */

export const dynamic = 'force-static';


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { content } = getLegalDoc('mesafeli-satis', locale);
  const canonicalUrl = canonical(locale, '/mesafeli-satis');

  return {
    title: `${content.heading} — Homesta Stay`,
    description: content.intro.slice(0, 155),
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates('/mesafeli-satis', 'tr'),
    },
  };
}

export default async function MesafeliSatisPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking.legal' });
  const { content, isFallback, shownLocale } = getLegalDoc('mesafeli-satis', locale);

  return (
    <LegalDocumentPage
      content={content}
      version={DOCUMENT_VERSION}
      versionLabel={t('versionLabel')}
      fallbackNotice={isFallback ? t('fallbackNotice', { shown: shownLocale }) : undefined}
    />
  );
}
