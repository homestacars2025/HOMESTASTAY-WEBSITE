import { getTranslations } from 'next-intl/server';
import { CreditCard, Landmark, Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * Card (Kuveyt Türk, international) or Libya (TLYNC, LYD).
 *
 * Two links and a query parameter — no client component, no state, no
 * JavaScript. The page is already force-dynamic, so switching methods costs a
 * server render and nothing else, and the choice survives a refresh, a
 * back-button, and a shared URL.
 *
 * Renders NOTHING when only one method is available: a chooser with one choice
 * is clutter, and clutter fails Law 2.
 */

interface PaymentMethodChoiceProps {
  locale:    string;
  reference: string;
  /** 'card' | 'lyd' — the currently selected method. */
  selected:  'card' | 'lyd';
  /** False when TLYNC is unconfigured or no LYD rate is available. */
  lydAvailable: boolean;
}

export async function PaymentMethodChoice({
  locale, reference, selected, lydAvailable,
}: PaymentMethodChoiceProps) {
  if (!lydAvailable) return null;

  const t = await getTranslations({ locale, namespace: 'booking.payment' });
  const href = `/booking/${encodeURIComponent(reference)}`;

  return (
    <div className="mb-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-3">
        {t('methodTitle')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Option
          href={`${href}?pay=card`}
          active={selected === 'card'}
          icon={<CreditCard className="w-[18px] h-[18px]" aria-hidden />}
          label={t('methodCard')}
          hint={t('methodCardHint')}
        />
        <Option
          href={`${href}?pay=lyd`}
          active={selected === 'lyd'}
          icon={<Landmark className="w-[18px] h-[18px]" aria-hidden />}
          label={t('methodLyd')}
          hint={t('methodLydHint')}
        />
      </div>
    </div>
  );
}

function Option({
  href, active, icon, label, hint,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      // min-h-[44px] is the touch target floor; the padding already clears it.
      className={
        'group flex items-start gap-3 rounded-[14px] border p-4 min-h-[44px] ' +
        'transition-colors duration-[240ms] ' +
        (active
          // Red marks the active state — the one decorative-looking use the
          // brand explicitly allows (Law 4: active states).
          ? 'border-stay bg-paper-warm'
          : 'border-rule hover:bg-paper-warm')
      }
    >
      <span className={active ? 'text-stay mt-[2px]' : 'text-ink-soft mt-[2px]'}>
        {active ? <Check className="w-[18px] h-[18px]" aria-hidden /> : icon}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[14px] font-medium text-ink leading-snug">{label}</span>
        <span className="text-[12px] text-mute leading-relaxed">{hint}</span>
      </span>
    </Link>
  );
}
