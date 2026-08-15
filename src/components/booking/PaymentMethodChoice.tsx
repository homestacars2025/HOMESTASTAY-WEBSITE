import { getTranslations } from 'next-intl/server';
import { CreditCard, Landmark, Check, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * Card (Kuveyt Türk, TRY), Libya (TLYNC, LYD), or the guest's wallet balance.
 *
 * Links and a query parameter — no client component, no state, no JavaScript.
 * The page is already force-dynamic, so switching methods costs a server
 * render and nothing else, and the choice survives a refresh, a back-button
 * and a shared URL.
 *
 * Renders NOTHING when only one method is available: a chooser with one choice
 * is clutter, and clutter fails Law 2.
 *
 * THE WALLET OPTION IS NOT A LINK WHEN IT CANNOT PAY. A guest whose balance is
 * short still sees it — with their real balance, the real total, and a way to
 * top up the difference — because silently hiding it would leave them
 * wondering where the wallet they know they have went.
 */

export interface WalletOffer {
  /** Formatted balance, for display. */
  balanceLabel: string;
  /** Formatted booking total, for the shortfall message. */
  totalLabel: string;
  /** False when the balance is below the total. */
  sufficient: boolean;
}

interface PaymentMethodChoiceProps {
  locale:    string;
  reference: string;
  /** The currently selected method. */
  selected:  'card' | 'lyd' | 'wallet';
  /** False when TLYNC is unconfigured or no LYD rate is available. */
  lydAvailable: boolean;
  /**
   * null when the guest is signed out, has no wallet, or the signed-in account
   * is not this booking's guest. Never offered on a booking someone else made.
   */
  wallet: WalletOffer | null;
}

export async function PaymentMethodChoice({
  locale, reference, selected, lydAvailable, wallet,
}: PaymentMethodChoiceProps) {
  // Card alone is not a choice worth rendering.
  if (!lydAvailable && !wallet) return null;

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

        {lydAvailable && (
          <Option
            href={`${href}?pay=lyd`}
            active={selected === 'lyd'}
            icon={<Landmark className="w-[18px] h-[18px]" aria-hidden />}
            label={t('methodLyd')}
            hint={t('methodLydHint')}
          />
        )}

        {wallet && (wallet.sufficient ? (
          <Option
            href={`${href}?pay=wallet`}
            active={selected === 'wallet'}
            icon={<Wallet className="w-[18px] h-[18px]" aria-hidden />}
            label={t('methodWallet')}
            hint={t('methodWalletHint', { balance: wallet.balanceLabel })}
          />
        ) : (
          <ShortOption
            icon={<Wallet className="w-[18px] h-[18px]" aria-hidden />}
            label={t('methodWallet')}
            hint={t('methodWalletShort', {
              balance: wallet.balanceLabel,
              total: wallet.totalLabel,
            })}
            actionHref="/wallet/top-up"
            actionLabel={t('methodWalletTopUp')}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The wallet, present but unusable.
 *
 * A <div>, not a disabled <Link> — there is nothing to navigate to, and an
 * anchor that goes nowhere is a trap for a keyboard or screen-reader user. The
 * only interactive thing in it is the top-up link, which is the one action
 * that actually helps.
 */
function ShortOption({
  icon, label, hint, actionHref, actionLabel,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-rule bg-paper-warm/50 p-4 min-h-[44px]">
      <span className="text-mute mt-[2px]">{icon}</span>
      <span className="flex flex-col gap-1">
        <span className="text-[14px] font-medium text-mute leading-snug">{label}</span>
        <span className="text-[12px] text-mute leading-relaxed">{hint}</span>
        <Link
          href={actionHref}
          className="mt-1 text-[12px] font-medium text-stay underline underline-offset-2"
        >
          {actionLabel}
        </Link>
      </span>
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
