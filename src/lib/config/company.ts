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
  phone:     '+90 542 843 40 91',
} as const;
