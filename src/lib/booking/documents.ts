/**
 * Turkish distance-selling documents — shared plumbing.
 *
 * Two separate legal instruments, recorded separately in
 * booking_document_acceptances because a regulator asks about them
 * separately. Proving acceptance means proving WHICH TEXT was accepted, so
 * DOCUMENT_VERSION is written alongside every acceptance row and rendered in
 * the footer of both documents.
 *
 * ⚠️ BUMP DOCUMENT_VERSION WHENEVER THE TEXT CHANGES — including the swap to
 * the lawyer-approved wording. Acceptances already recorded keep pointing at
 * the version the guest actually saw, which is the whole point of the column.
 */

export const DOCUMENT_VERSION = '2026-07-31';

/** Matches the CHECK constraint on booking_document_acceptances.document. */
export type LegalDocumentId = 'on_bilgilendirme' | 'mesafeli_satis';

export const LEGAL_DOCUMENT_IDS: readonly LegalDocumentId[] = [
  'on_bilgilendirme',
  'mesafeli_satis',
] as const;

export interface LegalDocSection {
  id: string;
  title: string;
  /** Paragraphs separated by a blank line, as LegalPage already renders. */
  body: string;
}

export interface LegalDocContent {
  heading: string;
  intro: string;
  tocTitle: string;
  sections: LegalDocSection[];
  /** Label above the booking summary annex on the Ön Bilgilendirme Formu. */
  annexTitle?: string;
  annexEmpty?: string;
}
