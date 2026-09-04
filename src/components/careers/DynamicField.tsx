'use client';

import { useTranslations } from 'next-intl';
import type { AnswerValue, FormField } from '@/lib/careers/types';

/**
 * One question from form_schema, drawn according to its type.
 *
 * `file` NEVER reaches here — CvUpload owns it, because its value goes to the
 * payload's top-level `cv` rather than into `answers`. ApplicationForm filters
 * it out before mapping.
 *
 * RTL: every axis is logical (ms/me, text-start, items-start), so this renders
 * correctly in Arabic with no second rule. The one exception is `number`,
 * which is dir="ltr" — a numeral is a left-to-right token in every locale, the
 * same call TopupAmountForm makes.
 */

const INPUT =
  'w-full bg-white border rounded-[10px] px-4 py-3 text-sm text-ink ' +
  'placeholder:text-mute transition-[border-color] duration-[240ms] ' +
  'focus:outline-none focus:border-ink-soft';

interface DynamicFieldProps {
  field: FormField;
  value: AnswerValue | undefined;
  invalid: boolean;
  onChange: (value: AnswerValue | undefined) => void;
}

export function DynamicField({ field, value, invalid, onChange }: DynamicFieldProps) {
  const t = useTranslations('careers.form');

  const id = `q-${field.key}`;
  const errorId = `${id}-error`;
  const border = invalid ? 'border-stay' : 'border-rule';

  // A radio group and a checkbox group are labelled by a <legend> inside a
  // <fieldset>; a single control by a <label>. Using the wrong one leaves a
  // screen reader announcing "radio button" with no question attached.
  const isGroup = field.type === 'single_choice' || field.type === 'multiple_choice';

  const label = (
    <>
      {field.label}
      {field.required && <span className="text-stay ms-0.5" aria-hidden> *</span>}
    </>
  );

  function control() {
    switch (field.type) {
      case 'short_text':
        return (
          <input
            id={id}
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={`${INPUT} ${border}`}
          />
        );

      case 'long_text':
        return (
          <textarea
            id={id}
            rows={5}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={`${INPUT} ${border} resize-y leading-relaxed`}
          />
        );

      case 'number':
        return (
          <input
            id={id}
            type="number"
            inputMode="numeric"
            dir="ltr"
            value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
            onChange={(e) => {
              const raw = e.target.value;
              // Empty clears the answer entirely rather than storing NaN —
              // pruneAnswers would drop a NaN anyway, but an undefined here
              // keeps the required check honest as the applicant types.
              if (raw === '') { onChange(undefined); return; }
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : undefined);
            }}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={`${INPUT} ${border} tabular-nums`}
          />
        );

      case 'date':
        return (
          <input
            id={id}
            type="date"
            dir="ltr"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={`${INPUT} ${border}`}
          />
        );

      case 'single_choice':
        return (
          <div className="flex flex-col gap-2">
            {field.options.map((option) => {
              const optionId = `${id}-${slugify(option)}`;
              return (
                <label
                  key={option}
                  htmlFor={optionId}
                  className={
                    'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 text-sm transition-colors duration-[240ms] ' +
                    (value === option
                      ? 'border-stay bg-paper-warm text-ink'
                      : `${border} text-ink-soft hover:bg-paper-warm`)
                  }
                >
                  <input
                    id={optionId}
                    type="radio"
                    name={id}
                    value={option}
                    checked={value === option}
                    onChange={() => onChange(option)}
                    className="h-4 w-4 shrink-0 accent-[var(--stay)]"
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        );

      case 'multiple_choice': {
        const selected = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-col gap-2">
            {field.options.map((option) => {
              const optionId = `${id}-${slugify(option)}`;
              const checked = selected.includes(option);
              return (
                <label
                  key={option}
                  htmlFor={optionId}
                  className={
                    'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 text-sm transition-colors duration-[240ms] ' +
                    (checked
                      ? 'border-stay bg-paper-warm text-ink'
                      : `${border} text-ink-soft hover:bg-paper-warm`)
                  }
                >
                  <input
                    id={optionId}
                    type="checkbox"
                    value={option}
                    checked={checked}
                    onChange={() => {
                      // Rebuilt from field.options, not by pushing onto the
                      // selection: that keeps the answer in the order the
                      // question asks, so two applicants who ticked the same
                      // boxes produce the same array.
                      const next = field.options.filter((o) =>
                        o === option ? !checked : selected.includes(o),
                      );
                      onChange(next.length > 0 ? next : undefined);
                    }}
                    className="h-4 w-4 shrink-0 accent-[var(--stay)]"
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        );
      }

      // 'file' is handled by CvUpload and filtered out before this renders.
      default:
        return null;
    }
  }

  if (isGroup) {
    return (
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-ink">{label}</legend>
        {control()}
        {invalid && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-stay">
            {t('errorRequired')}
          </p>
        )}
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {control()}
      {invalid && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-stay">
          {t('errorRequired')}
        </p>
      )}
    </div>
  );
}

/** A stable DOM id from an option's text, which may be Arabic or contain spaces. */
function slugify(value: string): string {
  return value.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 40);
}
