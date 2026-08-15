import { getTranslations } from 'next-intl/server';
import { Lock } from 'lucide-react';

/**
 * Card entry for a wallet top-up — a plain HTML form, deliberately.
 *
 * Same doctrine as the booking CardPaymentForm, for the same reasons: no
 * 'use client', no React state, no fetch. Card data never enters a client
 * bundle, the bank's 3DS page becomes the document through a real top-level
 * navigation (iframes banned by the bank since 31.12.2022), and it works with
 * JavaScript off.
 *
 * THE AMOUNT IS NOT A FIELD. It was fixed when the intent was written and is
 * re-read server-side from that intent, so nothing posted here can change what
 * is charged — the one invariant a guest-chosen amount must not be allowed to
 * break after the fact.
 *
 * The intent id IS a field, and that is safe: the route re-loads the intent and
 * checks it belongs to the session before touching it. Unlike a booking, a
 * top-up always has a signed-in user to check against.
 */

interface TopupCardFormProps {
  locale: string;
  intentId: string;
  /** Charged TRY figure, already formatted. Display only. */
  amountLabel: string;
  /** The same figure in USD — §9's "always show the USD equivalent". */
  usdLabel: string;
  /** TRY per USD, formatted. */
  rateLabel: string;
  /** From profiles, so the guest is not asked to retype it. May be empty. */
  phone: string;
}

export async function TopupCardForm({
  locale, intentId, amountLabel, usdLabel, rateLabel, phone,
}: TopupCardFormProps) {
  const t = await getTranslations({ locale, namespace: 'wallet.topup' });
  const tPay = await getTranslations({ locale, namespace: 'booking.payment' });

  const input =
    'w-full rounded-[14px] border border-rule bg-paper px-4 py-3 text-[15px] ' +
    'text-ink placeholder:text-mute transition-colors duration-[240ms] ' +
    'focus:outline-none focus:border-ink';
  const label =
    'block font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-2';

  return (
    <form
      method="POST"
      action="/api/payment/wallet/start"
      autoComplete="on"
      // Session replay must never be able to reconstruct a card. Clarity masks
      // inputs by default, but a default is a dashboard setting someone can
      // change, not a guarantee this codebase controls.
      data-clarity-mask="true"
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="intentId" value={intentId} />

      <AmountPanel
        title={t('chargedTryLabel')}
        amountLabel={amountLabel}
        usdLabel={usdLabel}
        note={t('rateNote', { rate: rateLabel })}
      />

      <div>
        <label htmlFor="holderName" className={label}>{tPay('holderName')}</label>
        <input
          id="holderName" name="holderName" type="text" required
          minLength={2} maxLength={45} autoComplete="cc-name"
          className={input}
        />
      </div>

      <div>
        <label htmlFor="cardNumber" className={label}>{tPay('cardNumber')}</label>
        {/* dir="ltr" in every locale: a card number is a left-to-right token. */}
        <input
          id="cardNumber" name="cardNumber" type="text" required
          inputMode="numeric" autoComplete="cc-number" dir="ltr"
          pattern="[0-9 ]{13,23}" placeholder="•••• •••• •••• ••••"
          className={input}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="expireMonth" className={label}>{tPay('month')}</label>
          <input
            id="expireMonth" name="expireMonth" type="text" required
            inputMode="numeric" autoComplete="cc-exp-month" dir="ltr"
            pattern="(0?[1-9]|1[0-2])" placeholder="MM" maxLength={2}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="expireYear" className={label}>{tPay('year')}</label>
          <input
            id="expireYear" name="expireYear" type="text" required
            inputMode="numeric" autoComplete="cc-exp-year" dir="ltr"
            pattern="[0-9]{2,4}" placeholder="YY" maxLength={4}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="cvv" className={label}>{tPay('cvv')}</label>
          <input
            id="cvv" name="cvv" type="text" required
            inputMode="numeric" autoComplete="cc-csc" dir="ltr"
            pattern="[0-9]{3,4}" maxLength={4}
            className={input}
          />
        </div>
      </div>

      {/* Billing address + phone — mandatory CardHolderData for 3D Secure 2.0.
          The booking flow reads the phone off the customers row; a top-up has
          no booking, so it comes from profiles and is shown here prefilled.
          Required, because 3DS 2.0 will not proceed without it. */}
      <fieldset className="border-t border-rule pt-5">
        <legend className={`${label} mb-3`}>{tPay('billingTitle')}</legend>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="phone" className={label}>{t('phoneLabel')}</label>
            <input
              id="phone" name="phone" type="tel" required
              defaultValue={phone} dir="ltr" inputMode="tel"
              autoComplete="tel" pattern="\+[1-9][0-9]{6,14}"
              placeholder="+90…" className={input}
            />
            <p className="mt-2 text-xs leading-relaxed text-mute">{t('phoneHint')}</p>
          </div>
          <div>
            <label htmlFor="billLine1" className={label}>{tPay('addressLine')}</label>
            <input
              id="billLine1" name="billLine1" type="text"
              autoComplete="billing address-line1" className={input}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="billCity" className={label}>{tPay('city')}</label>
              <input
                id="billCity" name="billCity" type="text"
                autoComplete="billing address-level2" className={input}
              />
            </div>
            <div>
              <label htmlFor="billState" className={label}>{tPay('state')}</label>
              <input
                id="billState" name="billState" type="text"
                autoComplete="billing address-level1" className={input}
              />
            </div>
            <div>
              <label htmlFor="billPostCode" className={label}>{tPay('postCode')}</label>
              <input
                id="billPostCode" name="billPostCode" type="text"
                inputMode="numeric" autoComplete="billing postal-code" dir="ltr"
                className={input}
              />
            </div>
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        className="min-h-[44px] w-full rounded-[999px] bg-stay py-4 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80"
      >
        {t('paySubmit', { amount: amountLabel })}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-mute">
        <Lock className="h-3 w-3" aria-hidden />
        {tPay('secureNote')}
      </p>
    </form>
  );
}

/** Shared between the card and LYD forms — one figure, spelled one way. */
export function AmountPanel({
  title, amountLabel, usdLabel, note,
}: {
  title: string;
  amountLabel: string;
  usdLabel: string;
  note: string;
}) {
  return (
    <div className="rounded-[14px] border border-rule p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-mute">
        {title}
      </p>
      {/* The local currency is primary — it is what leaves the guest's
          account — with the USD it was quoted in beside it (§9). */}
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-[1.5rem] font-semibold leading-none text-stay tabular-nums">
          {amountLabel}
        </span>
        {usdLabel && (
          <span className="text-[13px] text-mute tabular-nums">({usdLabel})</span>
        )}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-mute">{note}</p>
    </div>
  );
}
