'use server';

import { SUBMIT_URL, anonKey, fetchOpening } from '@/lib/careers/fetch-opening';
import {
  AGE_MAX,
  AGE_MIN,
  pruneAnswers,
  validateApplication,
  type FieldErrorKey,
  type FixedValues,
} from '@/lib/careers/validate';
import type { AnswerValue, ApplicationPayload, CvPayload } from '@/lib/careers/types';

/**
 * The application Server Action.
 *
 * WHY THIS IS NOT A fetch() FROM THE BROWSER
 *   Three reasons, and the first is the project rule: user-supplied input is
 *   validated at the server boundary (CLAUDE.md §10), the same way
 *   createHoldAction stands in front of create_booking_hold. The second is
 *   size — a 5 MB CV is ~6.7 MB once base64'd, and a refusal is far kinder
 *   when it comes from us with a sentence than from an edge with a status
 *   code. The third is that the applicant's IP is visible here, which is
 *   where a rate limit would go if this ever needs one.
 *
 *   The Edge Function stays the authority. Everything below mirrors its rules
 *   so a mistake becomes a field message, not a bare 400.
 *
 * ⚠️ THE CV IS NOT AN ANSWER. A `file` field in form_schema is drawn with its
 *   own label and required flag, but its value travels in the top-level `cv`.
 *   The Edge Function skips file fields when it builds `answers`, so putting
 *   it in both places would be the one way to make them disagree.
 */

// ── Limits ────────────────────────────────────────────────────────────────────

/** 5 MB on the RAW file, matching the client check. */
export const CV_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Generous room for base64 (+33%) plus the JSON around it. This is the guard
 * against a hand-crafted request, not against a real applicant — the client
 * already refused anything over CV_MAX_BYTES before reading it.
 */
const CV_MAX_BASE64 = Math.ceil((CV_MAX_BYTES * 4) / 3) + 4096;

export const CV_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/**
 * Extensions are checked alongside the MIME type because browsers are not
 * reliable about .docx — Safari and some Windows configurations send
 * application/octet-stream for it. Refusing a real CV over a header the
 * applicant cannot see or fix would be the wrong trade.
 */
export const CV_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;

// ── Result ────────────────────────────────────────────────────────────────────

export type ApplyResult =
  | { ok: true; applicantId: string | null }
  /** Field-level problems. Never a page-level error. */
  | { ok: false; status: 'invalid'; fields: FieldErrorKey[] }
  /** The Edge Function rejected it. `message` is its own sentence, if it gave one. */
  | { ok: false; status: 'rejected'; message: string | null }
  /** This opening has stopped accepting applications. */
  | { ok: false; status: 'closed' }
  | { ok: false; status: 'rate_limited' }
  | { ok: false; status: 'cv_too_large' }
  | { ok: false; status: 'cv_type' }
  | { ok: false; status: 'error' };

export interface ApplyInput {
  slug: string;
  fixed: FixedValues;
  answers: Record<string, AnswerValue | undefined>;
  cv: CvPayload | null;
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function submitApplication(input: ApplyInput): Promise<ApplyResult> {
  const { slug, fixed, answers, cv } = input;

  // ── The opening, re-read here ───────────────────────────────────────────
  // Not trusted from the client: the schema decides which questions are
  // required, and a caller who edited it could submit an empty application
  // against a form that demands ten answers. It also re-checks that the
  // opening is still published, which is the whole reason the page's 60s
  // cache is safe.
  const result = await fetchOpening(slug);

  if (result.status === 'not_found') return { ok: false, status: 'closed' };
  if (result.status === 'unavailable') return { ok: false, status: 'error' };
  if (result.status === 'unusable_form') {
    console.error('[careers/apply] submission against an unusable form', { slug });
    return { ok: false, status: 'error' };
  }

  const { fields } = result;

  // ── CV shape ─────────────────────────────────────────────────────────────
  if (cv) {
    if (!(CV_MIME_TYPES as readonly string[]).includes(cv.mime)) {
      return { ok: false, status: 'cv_type' };
    }
    if (typeof cv.data !== 'string' || cv.data.length === 0) {
      return { ok: false, status: 'cv_type' };
    }
    if (cv.data.length > CV_MAX_BASE64) {
      return { ok: false, status: 'cv_too_large' };
    }
  }

  // ── Everything else ──────────────────────────────────────────────────────
  const errors = validateApplication({ fixed, fields, answers, hasCv: cv !== null });
  if (errors.size > 0) {
    return { ok: false, status: 'invalid', fields: [...errors] };
  }

  // ── The payload ──────────────────────────────────────────────────────────
  // Optional empties are omitted, never sent as ''. A blank string in a
  // nullable column reads as "answered with nothing" to whoever screens these.
  const phone = fixed.phone.trim();
  const email = fixed.email.trim().toLowerCase();
  const age = fixed.age.trim();
  const nationality = fixed.nationality.trim();
  const city = fixed.residenceCity.trim();
  const district = fixed.residenceDistrict.trim();

  const ageNumber = age === '' ? null : Number(age);

  const payload: ApplicationPayload = {
    opening_slug: slug,
    full_name: fixed.fullName.trim(),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(ageNumber !== null && Number.isInteger(ageNumber) &&
        ageNumber >= AGE_MIN && ageNumber <= AGE_MAX
          ? { age: ageNumber } : {}),
    ...(nationality ? { nationality } : {}),
    ...(city ? { residence_city: city } : {}),
    // A district without its city is meaningless, and the form clears it on
    // every city change — this is the belt to that braces.
    ...(city && district ? { residence_district: district } : {}),
    answers: pruneAnswers(answers),
    ...(cv ? { cv } : {}),
    source: 'website',
  };

  const key = anonKey();
  if (!key) {
    console.error('[careers/apply] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
    return { ok: false, status: 'error' };
  }

  let response: Response;
  try {
    response = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
      // Never cached, in either direction: this is a write.
      cache: 'no-store',
    });
  } catch (err) {
    // We do not know whether it landed. Deliberately NOT retried — a duplicate
    // application is noise in someone's inbox, and the applicant can see for
    // themselves that they got no confirmation.
    console.error('[careers/apply] submit request failed', {
      slug, error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 'error' };
  }

  // The body is read once and reused: a Response body is a stream, and both
  // the success and the error branch want it.
  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (response.status === 201 || (response.ok && body?.ok === true)) {
    const applicantId =
      typeof body?.applicant_id === 'string' ? body.applicant_id : null;
    // The applicant's own details are deliberately NOT logged — this is a job
    // application, and the log is not the place for it.
    console.log('[careers/apply] application accepted', { slug, applicantId });
    return { ok: true, applicantId };
  }

  const message =
    typeof body?.message === 'string' && body.message.trim() !== ''
      ? body.message.trim()
      : typeof body?.error === 'string' && body.error.trim() !== ''
        ? body.error.trim()
        : null;

  switch (response.status) {
    case 400:
      // The Edge Function's own sentence is shown: it knows which question
      // failed and we do not. It is plain text from our own backend, rendered
      // as text — never as markup.
      console.warn('[careers/apply] rejected by the Edge Function', { slug, message });
      return { ok: false, status: 'rejected', message };

    case 404:
      return { ok: false, status: 'closed' };

    case 429:
      return { ok: false, status: 'rate_limited' };

    default:
      console.error('[careers/apply] unexpected response', {
        slug, status: response.status, message,
      });
      return { ok: false, status: 'error' };
  }
}
