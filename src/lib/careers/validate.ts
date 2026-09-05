import {
  KNOWN_FIELD_TYPES,
  type AnswerValue,
  type FieldType,
  type FormField,
  type Opening,
} from '@/lib/careers/types';

/**
 * Runtime narrowing for the recruitment Edge Function's payload, and the
 * shared answer rules. SERVER AND CLIENT — the form imports it to show field
 * errors, the Server Action imports it as a boundary check (CLAUDE.md §10).
 *
 * ⚠️ THE EDGE FUNCTION REMAINS THE AUTHORITY. Everything here mirrors its own
 * checks so a mistake becomes a field message instead of a round trip that
 * returns a bare 400 — the same relationship createHoldAction has with
 * create_booking_hold. This is a UX layer, not a security boundary.
 */

// ── form_schema ───────────────────────────────────────────────────────────────

/**
 * The two outcomes that matter, and why they are not the same.
 *
 *   A MALFORMED FIELD OF A KNOWN TYPE (single_choice with no options) is
 *   dropped and logged: the console author made one mistake and the other
 *   nine questions still work.
 *
 *   A REQUIRED FIELD OF AN UNKNOWN TYPE is fatal for the whole form. Dropping
 *   it would render a form that cannot possibly be accepted — the applicant
 *   fills everything, submits, and the server answers 400 about a question
 *   they were never shown. Refusing up front is the honest failure.
 */
export type SchemaResult =
  | { ok: true; fields: FormField[] }
  | { ok: false; reason: 'required_unknown_type' };

function isKnownType(value: unknown): value is FieldType {
  return (KNOWN_FIELD_TYPES as readonly string[]).includes(String(value));
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Options, cleaned. Blank entries are dropped — a radio with an empty label is noise. */
function options(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((o) => str(o)).filter((o) => o !== '');
}

export function parseFormSchema(raw: unknown): SchemaResult {
  if (!Array.isArray(raw)) {
    // No schema at all is legitimate: an opening can ask nothing beyond the
    // fixed fields. An object where an array belongs is not, but it degrades
    // to the same harmless place.
    return { ok: true, fields: [] };
  }

  const fields: FormField[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;

    const key = str(row.key);
    const label = str(row.label);
    const required = row.required === true;

    if (!key || !label) {
      console.warn('[careers/schema] field dropped — no key or label', { key, label });
      continue;
    }

    if (seen.has(key)) {
      // Two fields sharing a key would overwrite each other in `answers`, so
      // the second one silently erases the first applicant's answer.
      console.warn('[careers/schema] field dropped — duplicate key', { key });
      continue;
    }

    if (!isKnownType(row.type)) {
      if (required) {
        console.error('[careers/schema] REQUIRED field has an unknown type — form refused', {
          key, type: row.type,
        });
        return { ok: false, reason: 'required_unknown_type' };
      }
      console.warn('[careers/schema] optional field dropped — unknown type', {
        key, type: row.type,
      });
      continue;
    }

    const opts = options(row.options);

    if ((row.type === 'single_choice' || row.type === 'multiple_choice') && opts.length === 0) {
      if (required) {
        console.error('[careers/schema] REQUIRED choice field has no options — form refused', { key });
        return { ok: false, reason: 'required_unknown_type' };
      }
      console.warn('[careers/schema] optional choice field dropped — no options', { key });
      continue;
    }

    seen.add(key);
    fields.push({ key, label, type: row.type, required, options: opts });
  }

  return { ok: true, fields };
}

/**
 * The one file field, if any.
 *
 * There is exactly one `cv` slot in the payload, so a schema with two file
 * fields cannot be honoured. The first wins and the rest are logged — a
 * console mistake must not cost the applicant their CV.
 */
export function cvField(fields: FormField[]): FormField | null {
  const files = fields.filter((f) => f.type === 'file');
  if (files.length > 1) {
    console.warn('[careers/schema] multiple file fields — only the first is used', {
      keys: files.map((f) => f.key),
    });
  }
  return files[0] ?? null;
}

/** Questions that are NOT the CV — these are the ones that build `answers`. */
export function answerFields(fields: FormField[]): FormField[] {
  return fields.filter((f) => f.type !== 'file');
}

export function parseOpening(raw: unknown): Opening | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const slug = str(row.public_slug);
  const title = str(row.title);
  if (!slug || !title) return null;

  const schema = parseFormSchema(row.form_schema);
  // A refused schema still yields an Opening — the page needs the title to
  // render its "not available" state, and the caller re-parses to learn why.
  return {
    id: str(row.id),
    title,
    department: str(row.department) || null,
    platform: str(row.platform) || null,
    description: typeof row.description === 'string' ? row.description : null,
    public_slug: slug,
    form_schema: schema.ok ? schema.fields : [],
  };
}

// ── Applicant input ───────────────────────────────────────────────────────────

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const E164_RE = /^\+[1-9][0-9]{6,14}$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const AGE_MIN = 16;
export const AGE_MAX = 99;

/**
 * CV limits.
 *
 * ⚠️ THEY LIVE HERE, NOT IN actions.ts, AND THAT IS LOAD-BEARING. A file with
 * 'use server' may export only async functions: Next replaces every other
 * export with a server-action reference, so a Client Component importing an
 * array from it receives a proxy and `[...CONST]` throws "is not iterable" —
 * which is exactly what took the page down on first deploy. Anything both
 * sides need is a plain module, imported by the action and the form alike.
 */

/**
 * 3 MB, on the RAW file — never on its base64 expansion.
 *
 * ⚠️ PAIRED WITH experimental.serverActions.bodySizeLimit IN next.config.ts.
 * The CV crosses the wire base64-encoded inside a Server Action payload, so
 * the real ceiling is this × 1.34 plus the rest of the form. Raise one without
 * the other and every application carrying a large CV dies at a 413 that
 * reaches the applicant as a blank error page.
 *
 * Lowered from 5 MB after that happened. 3 MB is still generous for a CV — a
 * text PDF is well under 1 MB — and it halves the upload time that made this
 * fail on a phone in the first place.
 */
export const CV_MAX_BYTES = 3 * 1024 * 1024;

export const CV_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/**
 * Checked alongside the MIME type, not instead of it: browsers send
 * application/octet-stream for .docx often enough that a mime-only rule
 * rejects real CVs.
 */
export const CV_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;

/** "5.0 MB" — one spelling of the limit, for every message that names it. */
export function humanFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Error keys the form turns into localized messages. */
export type FieldErrorKey =
  | 'full_name'
  | 'contact'
  | 'age'
  | 'cv'
  /** Any dynamic question, keyed by its own `key`. */
  | string;

export interface FixedValues {
  fullName: string;
  phone: string;
  email: string;
  age: string;
  nationality: string;
}

/**
 * Every rule, in one place, so the form and the Server Action cannot disagree
 * about whether an application is complete.
 *
 * Returns a Set of field keys, not messages: the caller owns the wording, and
 * the wording lives in four message files.
 */
export function validateApplication(input: {
  fixed: FixedValues;
  fields: FormField[];
  answers: Record<string, AnswerValue | undefined>;
  hasCv: boolean;
}): Set<FieldErrorKey> {
  const errors = new Set<FieldErrorKey>();
  const { fixed, fields, answers, hasCv } = input;

  if (!fixed.fullName.trim()) errors.add('full_name');

  // "At least one of phone or email" — the error belongs to the PAIR, not to
  // either box, so it is one key and the form renders it under both.
  const phone = fixed.phone.trim();
  const email = fixed.email.trim();
  const phoneOk = phone !== '' && E164_RE.test(phone);
  const emailOk = email !== '' && EMAIL_RE.test(email);
  if (!phoneOk && !emailOk) errors.add('contact');

  // Optional, but a value that IS present must be sane.
  const age = fixed.age.trim();
  if (age !== '') {
    const n = Number(age);
    if (!Number.isInteger(n) || n < AGE_MIN || n > AGE_MAX) errors.add('age');
  }

  const cv = cvField(fields);
  if (cv?.required && !hasCv) errors.add('cv');

  for (const field of answerFields(fields)) {
    if (!field.required) continue;
    const value = answers[field.key];

    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'number' && !Number.isFinite(value));

    if (missing) errors.add(field.key);
  }

  return errors;
}

/**
 * Drop empty optional answers before sending.
 *
 * An empty string for an unanswered optional question is not an answer, and
 * storing one makes "skipped" indistinguishable from "left blank on purpose"
 * for whoever reads these applications.
 */
export function pruneAnswers(
  answers: Record<string, AnswerValue | undefined>,
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}
