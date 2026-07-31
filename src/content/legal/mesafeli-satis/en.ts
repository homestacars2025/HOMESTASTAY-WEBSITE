import type { LegalDocContent } from '@/lib/booking/documents';
import { COMPANY } from '@/lib/config/company';

/**
 * DISTANCE SALES CONTRACT — English courtesy translation.
 * The Turkish text in ./tr.ts is the legally operative version.
 */
export const mesafeliSatisEn: LegalDocContent = {
  heading: 'Distance Sales Contract',

  intro:
    'This contract is governed by Turkish Consumer Protection Law No. 6502 and ' +
    'the Distance Contracts Regulation, and is deemed concluded between the ' +
    'parties upon completion of payment. This is a courtesy translation; the ' +
    'Turkish text is the legally operative version.',

  tocTitle: 'Articles',

  sections: [
    {
      id: 'taraflar',
      title: 'Article 1 — Parties',
      body:
        'SELLER / INTERMEDIARY SERVICE PROVIDER\n' +
        `Company: ${COMPANY.legalName}\nAddress: ${COMPANY.address}\nMERSIS: ${COMPANY.mersis}\n` +
        `Tax office / number: ${COMPANY.taxOffice} / ${COMPANY.taxNo}\n` +
        `Email: ${COMPANY.email}\nPhone: ${COMPANY.phone}\n\n` +
        'BUYER\nThe name, surname, email and telephone number declared during ' +
        'booking apply. The BUYER is responsible for the accuracy of this ' +
        'information.',
    },
    {
      id: 'konu',
      title: 'Article 2 — Subject of the Contract',
      body:
        'The subject of this contract is the provision of accommodation at the ' +
        'unit selected electronically by the BUYER, between the stated ' +
        'check-in and check-out dates, and the determination of the parties’ ' +
        'rights and obligations.\n\n' +
        'The SELLER does not own the accommodation and acts as an intermediary ' +
        'between the property owner and the BUYER. Actual provision of the ' +
        'stay is the property owner’s responsibility.',
    },
    {
      id: 'bedel',
      title: 'Article 3 — Price and Payment',
      body:
        'The total is the sum of the amounts calculated separately for each ' +
        'night, inclusive of all taxes. The price is set in US dollars and is ' +
        'collected in Turkish lira at an exchange rate fixed at the moment of ' +
        'payment.\n\n' +
        'The fixed rate and the TRY amount to be charged are shown to the ' +
        'BUYER before payment. Payment is made with 3D Secure authentication ' +
        'and card details are not stored by the SELLER.',
    },
    {
      id: 'onay',
      title: 'Article 4 — Confirmation of the Booking',
      body:
        'Receipt of payment does not mean the booking is confirmed. After ' +
        'payment the request is sent to the property owner, and the booking is ' +
        'confirmed if the owner approves within 12 hours at the latest.\n\n' +
        'If the owner declines or does not respond within 12 hours, the ' +
        'contract is deemed not to have been concluded and the full amount ' +
        'collected is refunded in accordance with Article 6.',
    },
    {
      id: 'cayma',
      title: 'Article 5 — Absence of a Right of Withdrawal',
      body:
        'Under Article 15/1(g) of the Distance Contracts Regulation, there is ' +
        'NO RIGHT OF WITHDRAWAL for contracts concerning accommodation that ' +
        'must be provided on a specific date or period. As this booking is ' +
        'tied to specific dates it falls within that exemption, which the ' +
        'BUYER accepts.\n\n' +
        'This article does not remove the BUYER’s right to a refund where the ' +
        'booking is not approved under Article 4.',
    },
    {
      id: 'iade',
      title: 'Article 6 — Refund',
      body:
        'Refunds are made to the card used for payment, in the same Turkish ' +
        'lira amount that was collected. Neither party may claim the ' +
        'difference arising from exchange-rate movement at the date of refund.\n\n' +
        'The refund is initiated immediately by the SELLER; appearance on the ' +
        'card account may take 3–10 business days depending on the bank. For ' +
        'cards denominated in a foreign currency, conversion differences ' +
        'applied by the bank are a matter between the BUYER and their bank.',
    },
    {
      id: 'yukumluluk',
      title: 'Article 7 — General Provisions',
      body:
        'The BUYER agrees to comply with the rules stated in the listing and ' +
        'with the reasonable instructions of the property owner.\n\n' +
        'The BUYER agrees not to exceed the declared number of guests. Where ' +
        'the declaration is untrue, the property owner reserves the right to ' +
        'refuse entry.\n\n' +
        'In cases of force majeure the parties’ obligations are suspended to ' +
        'the extent performance becomes impossible, and the amount collected ' +
        'is refunded.',
    },
    {
      id: 'delil',
      title: 'Article 8 — Information, Evidence and Records',
      body:
        'This contract and the Pre-Information Form were presented to the ' +
        'BUYER electronically before payment and were read and accepted by the ' +
        'BUYER. The record of acceptance is retained together with the date, ' +
        'time, document version and IP address.\n\n' +
        'Both documents are additionally sent as PDF attachments to the email ' +
        'address declared by the BUYER after payment.\n\n' +
        'The parties agree that the SELLER’s electronic records constitute ' +
        'conclusive evidence within the meaning of Article 193 of the Code of ' +
        'Civil Procedure No. 6100.',
    },
    {
      id: 'yururluk',
      title: 'Article 9 — Effectivity',
      body:
        'This contract enters into force upon its electronic acceptance by the ' +
        'BUYER and the completion of payment.\n\n' +
        'In the event of a dispute, the Consumer Arbitration Committees and ' +
        'Consumer Courts have jurisdiction within the monetary limits ' +
        'announced by the Ministry of Trade.',
    },
  ],
};
