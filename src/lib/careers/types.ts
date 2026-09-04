/**
 * Shapes returned by the recruitment Edge Function.
 *
 * ⚠️ form_schema IS UNTRUSTED INPUT. It comes from the Edge Function, but it is
 * authored by hand in the recruitment console — so a typo there must degrade
 * this page, never break it. Nothing below is asserted; everything is narrowed
 * at runtime by lib/careers/validate.ts.
 */

/** The field types the console can emit. Anything else is unknown to this UI. */
export const KNOWN_FIELD_TYPES = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'number',
  'date',
  'file',
] as const;

export type FieldType = (typeof KNOWN_FIELD_TYPES)[number];

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Present on single_choice / multiple_choice. Empty elsewhere. */
  options: string[];
}

export interface Opening {
  id: string;
  title: string;
  department: string | null;
  platform: string | null;
  description: string | null;
  public_slug: string;
  /** Already validated and narrowed. Unusable entries are dropped. */
  form_schema: FormField[];
}

/**
 * One answer value.
 *
 * multiple_choice is an array, number is a number, everything else a string.
 * `file` NEVER appears here — a file field's value travels in the top-level
 * `cv`, which is what the Edge Function expects (it skips file fields when it
 * builds `answers`).
 */
export type AnswerValue = string | number | string[];

export interface CvPayload {
  /** base64, no data: prefix. */
  data: string;
  mime: string;
}

export interface ApplicationPayload {
  opening_slug: string;
  full_name: string;
  phone?: string;
  email?: string;
  age?: number;
  nationality?: string;
  /**
   * Still part of the Edge Function's contract, and deliberately never set by
   * this form: the fixed city and district fields were removed, and the
   * Istanbul district is now an ordinary form_schema question. Its answer
   * therefore arrives in `answers`, under whatever key the console gave it —
   * NOT here.
   */
  residence_city?: string;
  residence_district?: string;
  answers: Record<string, AnswerValue>;
  cv?: CvPayload;
  source: 'website';
}
