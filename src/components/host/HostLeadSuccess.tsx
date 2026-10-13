'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle, MessageCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * After the "List your property" form: the team answers on WhatsApp within a
 * day; the button opens the Hosts number straight away for anyone who'd
 * rather not wait. "Already a host? Sign in" only for signed-out visitors.
 */
export function HostLeadSuccess({ hostsWhatsapp, signedIn }: { hostsWhatsapp: string; signedIn: boolean }) {
  const t = useTranslations('pages.host.success');
  const href = `https://wa.me/${hostsWhatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(t('whatsappText'))}`;

  return (
    <div role="status" className="flex flex-col items-center text-center gap-5 py-10">
      <CheckCircle size={44} strokeWidth={1.5} className="text-stay" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-medium tracking-[-0.025em] text-ink">{t('thanks')}</h2>
        <p className="text-sm text-ink-soft leading-relaxed max-w-sm">{t('within24h')}</p>
      </div>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 w-full max-w-sm items-center justify-center gap-2 rounded-[999px] bg-stay text-white text-sm font-medium px-6 py-3 transition-opacity duration-[240ms] hover:opacity-90"
      >
        <MessageCircle size={16} strokeWidth={1.75} aria-hidden="true" />
        {t('whatsapp')}
      </a>

      {!signedIn && (
        <p className="text-sm text-mute">
          {t('alreadyHost')}{' '}
          <Link href="/sign-in" className="font-medium text-ink underline underline-offset-4 hover:text-stay transition-colors duration-[240ms]">
            {t('signIn')}
          </Link>
        </p>
      )}
    </div>
  );
}
