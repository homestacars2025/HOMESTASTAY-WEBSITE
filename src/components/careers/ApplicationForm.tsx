'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { DynamicField } from '@/components/careers/DynamicField';
import { FixedFields } from '@/components/careers/FixedFields';
import { CvUpload } from '@/components/careers/CvUpload';
import { ApplicationSuccess } from '@/components/careers/ApplicationSuccess';
import { submitApplication, type ApplyResult } from '@/app/[locale]/careers/[slug]/actions';
import { answerFields, cvField, validateApplication, type FieldErrorKey, type FixedValues } from '@/lib/careers/validate';
import type { AnswerValue, CvPayload, FormField } from '@/lib/careers/types';

/**
 * The application form.
 *
 * The only Client Component on the page: the shell, the role description and
 * everything else stay server-rendered (Law 1).
 *
 * ⚠️ NO DOUBLE SUBMIT. `pending` disables the button, and a resolved success
 * swaps the whole form for the confirmation — there is nothing left to press.
 * A failed submit is NOT retried automatically: a duplicate application is
 * noise in a recruiter's inbox, and the applicant can see they got no
 * confirmation.
 *
 * ⚠️ THE CV IS DRAWN FROM form_schema BUT SENT SEPARATELY. A `file` field
 * supplies the label and the required flag; its value goes to the payload's
 * top-level `cv`, never into `answers`. answerFields() is what keeps the two
 * apart, in one place.
 */

const EMPTY_FIXED: FixedValues = {
  fullName: '',
  phone: '',
  email: '',
  age: '',
  nationality: '',
  residenceCity: '',
  residenceDistrict: '',
};

interface ApplicationFormProps {
  slug: string;
  /** Shown on the confirmation, so the applicant sees what they applied to. */
  title: string;
  fields: FormField[];
}

export function ApplicationForm({ slug, title, fields }: ApplicationFormProps) {
  const t = useTranslations('careers.form');

  const [fixed, setFixed] = useState<FixedValues>(EMPTY_FIXED);
  const [answers, setAnswers] = useState<Record<string, AnswerValue | undefined>>({});
  const [cv, setCv] = useState<CvPayload | null>(null);

  const [errors, setErrors] = useState<Set<FieldErrorKey>>(new Set());
  const [pageError, setPageError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // Split once per schema, not per render pass.
  const questions = useMemo(() => answerFields(fields), [fields]);
  const cvQuestion = useMemo(() => cvField(fields), [fields]);

  function setFixedValue<K extends keyof FixedValues>(key: K, value: FixedValues[K]) {
    setFixed((prev) => {
      const next = { ...prev, [key]: value };
      // ⚠️ A district belongs to exactly one city. Changing the city without
      // clearing it would submit an Istanbul district against Ankara — the
      // kind of wrong that looks right in the payload.
      if (key === 'residenceCity') next.residenceDistrict = '';
      return next;
    });
  }

  function messageFor(result: Extract<ApplyResult, { ok: false }>): string {
    switch (result.status) {
      // The Edge Function's own sentence, when it gave one: it knows which
      // question failed and this component does not. Rendered as text.
      case 'rejected':      return result.message ?? t('errorGeneric');
      case 'closed':        return t('errorClosed');
      case 'rate_limited':  return t('errorRateLimited');
      case 'cv_too_large':  return t('cvTooLarge', { max: '5.0 MB' });
      case 'cv_type':       return t('cvWrongType');
      case 'invalid':       return t('errorFix');
      default:              return t('errorGeneric');
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPageError(null);

    // Client-side first, so an obvious gap costs no round trip. The Server
    // Action re-runs exactly this, and the Edge Function after it.
    const local = validateApplication({ fixed, fields, answers, hasCv: cv !== null });
    if (local.size > 0) {
      setErrors(local);
      setPageError(t('errorFix'));
      return;
    }
    setErrors(new Set());

    startTransition(async () => {
      const result = await submitApplication({ slug, fixed, answers, cv });

      if (result.ok) {
        setDone(true);
        return;
      }

      if (result.status === 'invalid') setErrors(new Set(result.fields));
      setPageError(messageFor(result));
    });
  }

  if (done) return <ApplicationSuccess title={title} />;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      {pageError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[14px] border border-stay/25 bg-stay/5 px-4 py-3"
        >
          <AlertTriangle className="mt-[2px] h-[18px] w-[18px] shrink-0 text-stay" aria-hidden />
          <p className="text-[13px] leading-relaxed text-ink">{pageError}</p>
        </div>
      )}

      <FixedFields values={fixed} onChange={setFixedValue} errors={errors} />

      {questions.length > 0 && (
        <div className="flex flex-col gap-5 border-t border-rule pt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">
            {t('questionsTitle')}
          </p>

          {questions.map((field) => (
            <DynamicField
              key={field.key}
              field={field}
              value={answers[field.key]}
              invalid={errors.has(field.key)}
              onChange={(value) =>
                setAnswers((prev) => ({ ...prev, [field.key]: value }))
              }
            />
          ))}
        </div>
      )}

      {cvQuestion && (
        <div className="border-t border-rule pt-8">
          <CvUpload
            label={cvQuestion.label}
            required={cvQuestion.required}
            invalid={errors.has('cv')}
            errorId="cv-error"
            onChange={(next) => setCv(next)}
          />
          {errors.has('cv') && (
            <p id="cv-error" role="alert" className="mt-1 text-xs text-stay">
              {t('errorRequired')}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] w-full rounded-[999px] bg-stay py-4 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-60"
      >
        {pending ? t('submitting') : t('submit')}
      </button>

      <p className="text-center text-xs leading-relaxed text-mute">{t('privacyNote')}</p>
    </form>
  );
}
