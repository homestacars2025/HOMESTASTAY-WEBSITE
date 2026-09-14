// Single source of truth for the SELLER's legal identity — Homesta Grup Ltd Şti.
//
// Consumed by the site footer AND, as the seller / aracı hizmet sağlayıcı block,
// by both Turkish distance-selling documents (on-bilgilendirme + mesafeli-satis,
// en + tr). These identifiers are legally required under Law No. 6502; keeping
// them here means the contact surfaces and the contracts can never drift.
//
// Update a value ONCE here and it propagates to the footer and both contracts.
// Note: changing anything that appears in the contracts is a TEXT CHANGE — bump
// DOCUMENT_VERSION in src/lib/booking/documents.ts when you do.

import { CONTACT_EMAIL } from './social';

export const COMPANY = {
  /** Registered trade name (unvan). */
  legalName: 'HOMESTA GRUP DANIŞMANLIK HİZMETLERİ LİMİTED ŞİRKETİ',
  address:   'KAYABAŞI MAH. GAZİ YAŞARGİL CAD. T2 BLOK NO: 2 Y BAŞAKŞEHİR / İSTANBUL',
  taxOffice: 'BAŞAKŞEHİR',
  taxNo:     '4631515171',
  /** 16-digit MERSIS number (Merkezi Sicil Kayıt Sistemi). Verified from the
   *  official registry. */
  mersis:    '0463151517100001',
  /** Ticaret Sicil (trade registry) number. Note: the registry record still
   *  shows the former Kağıthane address; the company has moved to the Başakşehir
   *  address above, and the registry update is a separate admin task. */
  tradeRegistryNo: '1075209',
  /** Kept single-sourced in social.ts so the contact widgets and the legal
   *  seller block always show the same address. */
  email:     CONTACT_EMAIL,
  /**
   * The COMPANY line, not a person's mobile.
   *
   * Replaced 14 Sep 2026. The previous number was an individual's personal
   * phone, and it was not confined to the legal pages: organizationSchema()
   * carries it as contactPoint.telephone, and that schema is emitted from the
   * root layout on EVERY page — so it was in the JSON-LD of the homepage, the
   * listings, the blog, all four locales. Anything published that widely has
   * been crawled and is in third-party indexes; changing it here stops the
   * bleeding but does not retract what is already out.
   */
  phone:     '+90 535 207 32 12',
} as const;
