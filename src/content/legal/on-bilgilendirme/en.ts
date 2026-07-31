import type { LegalDocContent } from '@/lib/booking/documents';
import { COMPANY } from '@/lib/config/company';

/**
 * PRE-INFORMATION FORM — English courtesy translation.
 *
 * The Turkish text in ./tr.ts is the operative one: this is a Turkish
 * distance-selling instrument governed by Turkish law. Where the two differ,
 * Turkish prevails — stated in the intro so a guest is never misled.
 */
export const onBilgilendirmeEn: LegalDocContent = {
  heading: 'Pre-Information Form',

  intro:
    'This form sets out what you need to know before paying, as required by ' +
    'Turkish Consumer Protection Law No. 6502 and the Distance Contracts ' +
    'Regulation. A summary of your booking forms an inseparable annex to this ' +
    'form and appears at the foot of this page. This is a courtesy ' +
    'translation; the Turkish text is the legally operative version.',

  tocTitle: 'Contents',

  annexTitle: 'Annex 1 — Booking Summary',
  annexEmpty:
    'Your booking summary appears here once you have entered your dates and ' +
    'guest details.',

  sections: [
    {
      id: 'satici',
      title: '1. Seller / Intermediary Service Provider',
      body:
        `Company: ${COMPANY.legalName}\n\n` +
        `Address: ${COMPANY.address}\nMERSIS No: ${COMPANY.mersis}\n` +
        `Tax office / number: ${COMPANY.taxOffice} / ${COMPANY.taxNo}\n` +
        `Email: ${COMPANY.email}\nPhone: ${COMPANY.phone}\n\n` +
        'Homesta Stay does not own the accommodation. We are an intermediary ' +
        'connecting property owners with guests. The property owner is ' +
        'responsible for actually providing the stay.',
    },
    {
      id: 'hizmet',
      title: '2. Description of the Service',
      body:
        'The service is the right to stay in the accommodation you selected, ' +
        'between the check-in and check-out dates you specified, for the ' +
        'number of guests you specified.\n\n' +
        'The characteristics, capacity and amenities of the accommodation are ' +
        'set out on its listing page. The booking is valid only for the dates ' +
        'stated and is not transferable.',
    },
    {
      id: 'bedel',
      title: '3. Price and Payment Terms',
      body:
        'The total is the sum of the amounts calculated separately for each ' +
        'night of your stay. It is not a nightly rate multiplied by the number ' +
        'of nights: seasonal pricing and length-of-stay discounts are applied ' +
        'per night. All taxes are included.\n\n' +
        'Our prices are set in US dollars (USD). Payment is taken in Turkish ' +
        'lira (TRY) at an exchange rate fixed at the moment of payment. The ' +
        'fixed rate and the TRY amount are shown clearly on the payment screen, ' +
        'and that TRY amount is what will be charged to your card.\n\n' +
        'Payment is made by credit or debit card with 3D Secure ' +
        'authentication. We do not store your card details.\n\n' +
        'If your card is denominated in a currency other than TRY, the ' +
        'conversion rate and any fees applied by your bank are a matter ' +
        'between you and your bank and are not set by us.',
    },
    {
      id: 'onay',
      title: '4. Owner Approval — the 12-Hour Window',
      body:
        'IMPORTANT: taking your payment does not mean your booking is ' +
        'confirmed. Once payment is taken, your request is sent to the ' +
        'property owner.\n\n' +
        'The owner has at most 12 hours to respond. If they approve within ' +
        'that time your booking is confirmed and you receive a confirmation ' +
        'email.\n\n' +
        'If the owner declines, or does not respond within 12 hours, the ' +
        'booking is treated as not having taken place and the full amount you ' +
        'paid is refunded on the terms in sections 5 and 6. Nothing is ' +
        'deducted from you in that case.',
    },
    {
      id: 'cayma',
      title: '5. Right of Withdrawal and Its Exemption',
      body:
        'Under Article 15/1(g) of the Distance Contracts Regulation, THERE IS ' +
        'NO RIGHT OF WITHDRAWAL for contracts concerning accommodation, ' +
        'transport of goods, car rental, catering, or leisure services that ' +
        'must be provided on a specific date or period.\n\n' +
        'Because your booking is tied to specific check-in and check-out ' +
        'dates, it falls within this exemption. You accept this expressly ' +
        'before payment.\n\n' +
        'This exemption DOES NOT affect your right to a refund if the owner ' +
        'does not approve. An unapproved booking is refunded in every case.',
    },
    {
      id: 'iade',
      title: '6. Refund Conditions',
      body:
        'Where a refund is due — the owner declines, or does not respond within ' +
        '12 hours — it is made to the same card used for payment. We cannot ' +
        'refund to a different card or account.\n\n' +
        'The refund is the same Turkish lira amount that was charged. The rate ' +
        'fixed at payment governs; any change in the exchange rate between ' +
        'payment and refund is not passed on to you and is not claimed from you.\n\n' +
        'We start the refund immediately. How long it takes to appear on your ' +
        'card statement depends on your bank and can be 3–10 business days. ' +
        'That period is under your bank’s control, not ours.\n\n' +
        'If your card is in a currency other than TRY, your bank’s ' +
        'conversion rates at the time of the charge and at the time of the ' +
        'refund may differ. That difference is between you and your bank.',
    },
    {
      id: 'iptal',
      title: '7. Cancelling a Confirmed Booking',
      body:
        'Once the owner has approved, cancellation is governed by the ' +
        'cancellation policy shown on that listing page.\n\n' +
        'Where a cancellation results from force majeure or from the property ' +
        'owner, the full amount you paid is refunded.',
    },
    {
      id: 'sikayet',
      title: '8. Complaints and Dispute Resolution',
      body:
        `You can send requests and complaints to ${COMPANY.email}.\n\n` +
        'In the event of a dispute, the Consumer Arbitration Committees and ' +
        'Consumer Courts in the consumer’s place of residence or the place ' +
        'where the transaction took place have jurisdiction, within the ' +
        'monetary limits announced annually by the Ministry of Trade.',
    },
  ],
};
