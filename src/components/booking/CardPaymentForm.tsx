import { getTranslations } from 'next-intl/server';
import { Lock } from 'lucide-react';

/**
 * Card entry — a plain HTML form, deliberately.
 *
 * No 'use client', no React state, no fetch. The form POSTs natively to
 * /api/payment/start, which means:
 *   - card data never enters a client bundle or a JS variable we control
 *   - the response (the bank's 3DS page) becomes the document via a real
 *     top-level navigation, which is the only option since the bank banned
 *     iframes on 31.12.2022
 *   - it works with JavaScript disabled
 *
 * The amount is NOT a field here. It is read server-side from the payment
 * attempt, so nothing the browser sends can influence what is charged.
 */

interface CardPaymentFormProps {
  locale: string;
  /** Charged amount, already formatted for display only. */
  amountLabel: string;
}

export async function CardPaymentForm({ locale, amountLabel }: CardPaymentFormProps) {
  const t = await getTranslations({ locale, namespace: 'booking.payment' });

  const input =
    'w-full rounded-[14px] border border-rule bg-paper px-4 py-3 text-[15px] ' +
    'text-ink placeholder:text-mute transition-colors duration-[240ms] ' +
    'focus:outline-none focus:border-ink';
  const label =
    'block font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-2';

  return (
    <form
      method="POST"
      action="/api/payment/start"
      autoComplete="on"
      // Session replay must never be able to reconstruct a card. Clarity masks
      // input values by default, but a default is a dashboard setting someone
      // can change, not a guarantee this codebase controls — so the whole form
      // is masked explicitly here. Belt and braces on the one surface where
      // getting it wrong means a PAN in a replay.
      data-clarity-mask="true"
      className="flex flex-col gap-5"
    >
      {/* The callback cannot know the guest's language, but this side can. */}
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="holderName" className={label}>{t('holderName')}</label>
        <input
          id="holderName" name="holderName" type="text" required
          minLength={2} maxLength={45} autoComplete="cc-name"
          className={input}
        />
      </div>

      <div>
        <label htmlFor="cardNumber" className={label}>{t('cardNumber')}</label>
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
          <label htmlFor="expireMonth" className={label}>{t('month')}</label>
          <input
            id="expireMonth" name="expireMonth" type="text" required
            inputMode="numeric" autoComplete="cc-exp-month" dir="ltr"
            pattern="(0?[1-9]|1[0-2])" placeholder="MM" maxLength={2}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="expireYear" className={label}>{t('year')}</label>
          <input
            id="expireYear" name="expireYear" type="text" required
            inputMode="numeric" autoComplete="cc-exp-year" dir="ltr"
            pattern="[0-9]{2,4}" placeholder="YY" maxLength={4}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="cvv" className={label}>{t('cvv')}</label>
          <input
            id="cvv" name="cvv" type="text" required
            inputMode="numeric" autoComplete="cc-csc" dir="ltr"
            pattern="[0-9]{3,4}" maxLength={4}
            className={input}
          />
        </div>
      </div>

      {/* Billing address — mandatory for 3D Secure 2.0 (CardHolderData). */}
      <fieldset className="border-t border-rule pt-5">
        <legend className={`${label} mb-3`}>{t('billingTitle')}</legend>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="billLine1" className={label}>{t('addressLine')}</label>
            <input
              id="billLine1" name="billLine1" type="text"
              autoComplete="billing address-line1" className={input}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="billCity" className={label}>{t('city')}</label>
              <input
                id="billCity" name="billCity" type="text"
                autoComplete="billing address-level2" className={input}
              />
            </div>
            <div>
              <label htmlFor="billState" className={label}>{t('state')}</label>
              <input
                id="billState" name="billState" type="text"
                autoComplete="billing address-level1" className={input}
              />
            </div>
            <div>
              <label htmlFor="billPostCode" className={label}>{t('postCode')}</label>
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
        className="w-full bg-stay text-white rounded-[999px] py-4 text-sm font-semibold min-h-[44px] transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80"
      >
        {t('submit', { amount: amountLabel })}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-mute">
        <Lock className="w-3 h-3" aria-hidden />
        {t('secureNote')}
      </p>
    </form>
  );
}
