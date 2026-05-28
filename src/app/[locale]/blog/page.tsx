import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.blog' });
  return { title: t('title') };
}

export default function BlogPage() {
  const t = useTranslations('pages.blog');

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-16">
        <h1 className="text-[clamp(2rem,7vw,3rem)] font-medium tracking-[-0.04em] leading-[0.95] text-ink mb-4">
          {t('title')}
        </h1>
        <p className="text-base text-mute leading-relaxed max-w-sm">
          {t('comingSoon')}
        </p>
      </main>
    </div>
  );
}
