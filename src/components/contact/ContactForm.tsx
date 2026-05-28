'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CheckCircle } from 'lucide-react';
import { submitContact } from '@/app/[locale]/contact/actions';

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldLabel({
  htmlFor, children, required,
}: {
  htmlFor: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-ink mb-1.5">
      {children}
      {required && <span className="text-stay ms-0.5" aria-hidden="true"> *</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="text-xs text-stay mt-1">{message}</p>;
}

const INPUT =
  'w-full bg-white border border-rule rounded-[10px] px-4 py-3 text-sm text-ink ' +
  'placeholder:text-mute transition-[border-color] duration-[240ms] ' +
  'focus:outline-none focus:border-ink-soft';

// ── Component ─────────────────────────────────────────────────────────────────

type SubmitStatus = 'idle' | 'success' | 'required' | 'emailInvalid' | 'generic';

export function ContactForm() {
  const t      = useTranslations('pages.contact');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [honey,   setHoney]   = useState('');

  const [errors, setErrors]     = useState<Partial<Record<'name' | 'email' | 'message', string>>>({});
  const [status, setStatus]     = useState<SubmitStatus>('idle');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!name.trim())                               errs.name    = t('errorRequired');
    if (!email.trim())                              errs.email   = t('errorRequired');
    else if (!EMAIL_RE.test(email.trim()))          errs.email   = t('errorEmailInvalid');
    if (!message.trim())                            errs.message = t('errorRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    startTransition(async () => {
      const res = await submitContact({
        name:    name.trim(),
        email:   email.trim().toLowerCase(),
        subject: subject.trim(),
        message: message.trim(),
        locale,
        _honey:  honey,
      });
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus(
          res.error === 'emailInvalid' ? 'emailInvalid'
          : res.error === 'required'   ? 'required'
          : 'generic'
        );
      }
    });
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (status === 'success') {
    return (
      <div className="border border-rule rounded-[14px] p-8 text-center">
        <CheckCircle className="w-10 h-10 text-stay mx-auto mb-4" />
        <h3 className="text-[1.1rem] font-medium text-ink tracking-[-0.02em] mb-2">
          {t('successTitle')}
        </h3>
        <p className="text-mute text-sm leading-relaxed">{t('successBody')}</p>
        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setName(''); setEmail(''); setSubject(''); setMessage('');
            setErrors({});
          }}
          className="mt-5 text-sm text-ink-soft underline underline-offset-2 hover:text-ink transition-colors duration-[240ms]"
        >
          {t('sendAnother')}
        </button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

      {/* Honeypot — invisible to users, catches most bots */}
      <input
        type="text"
        name="_honey"
        value={honey}
        onChange={(e) => setHoney(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
      />

      {/* Name */}
      <div>
        <FieldLabel htmlFor="c-name" required>{t('nameLabel')}</FieldLabel>
        <input
          id="c-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
          placeholder={t('namePlaceholder')}
          className={INPUT}
        />
        <FieldError message={errors.name} />
      </div>

      {/* Email */}
      <div>
        <FieldLabel htmlFor="c-email" required>{t('formEmailLabel')}</FieldLabel>
        <input
          id="c-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }}
          placeholder={t('formEmailPlaceholder')}
          className={INPUT}
        />
        <FieldError message={errors.email} />
      </div>

      {/* Subject */}
      <div>
        <FieldLabel htmlFor="c-subject">{t('subjectLabel')}</FieldLabel>
        <input
          id="c-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t('subjectPlaceholder')}
          className={INPUT}
        />
      </div>

      {/* Message */}
      <div>
        <FieldLabel htmlFor="c-message" required>{t('messageLabel')}</FieldLabel>
        <textarea
          id="c-message"
          value={message}
          onChange={(e) => { setMessage(e.target.value); setErrors((p) => ({ ...p, message: '' })); }}
          placeholder={t('messagePlaceholder')}
          rows={5}
          className={`${INPUT} resize-y`}
        />
        <FieldError message={errors.message} />
      </div>

      {/* Server-side error */}
      {(status === 'required' || status === 'emailInvalid' || status === 'generic') && (
        <p role="alert" className="text-sm text-stay -mt-1">
          {status === 'emailInvalid' ? t('errorEmailInvalid')
           : status === 'required'   ? t('errorRequired')
           : t('errorGeneric')}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="self-start flex items-center gap-2 bg-stay text-white rounded-[999px] px-7 py-3 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? t('sending') : t('submitCta')}
      </button>
    </form>
  );
}
