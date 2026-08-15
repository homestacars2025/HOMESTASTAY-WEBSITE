'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

const LENGTH = 6;

interface OtpFormProps {
  email: string;
  returnUrl?: string;
}

export function OtpForm({ email, returnUrl }: OtpFormProps) {
  const t      = useTranslations('auth.verifyEmail');
  const router = useRouter();

  const [digits,   setDigits]   = useState<string[]>(Array(LENGTH).fill(''));
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const inputRefs  = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // No email → can't proceed
  const missingEmail = !email;

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function focus(idx: number) {
    inputRefs.current[idx]?.focus();
  }

  function handleChange(idx: number, raw: string) {
    // Accept digits only; handle multi-char (quick type or autofill)
    const chars = raw.replace(/\D/g, '');
    if (!chars) {
      // Erasure via onChange (some browsers)
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      return;
    }
    // Spread chars across boxes from idx
    const next = [...digits];
    let focusIdx = idx;
    for (let i = 0; i < chars.length && idx + i < LENGTH; i++) {
      next[idx + i] = chars[i];
      focusIdx = idx + i;
    }
    setDigits(next);
    if (focusIdx < LENGTH - 1) focus(focusIdx + 1);
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        // Clear current
        const next = [...digits];
        next[idx] = '';
        setDigits(next);
      } else if (idx > 0) {
        focus(idx - 1);
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      focus(idx - 1);
    } else if (e.key === 'ArrowRight' && idx < LENGTH - 1) {
      e.preventDefault();
      focus(idx + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, startIdx: number) {
    e.preventDefault();
    const chars = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH - startIdx);
    if (!chars) return;
    const next = [...digits];
    let last = startIdx;
    for (let i = 0; i < chars.length; i++) {
      next[startIdx + i] = chars[i];
      last = startIdx + i;
    }
    setDigits(next);
    focus(Math.min(last + 1, LENGTH - 1));
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== LENGTH) {
      setError(t('error.incompleteCode'));
      return;
    }

    setError('');
    setLoading(true);

    const supabase = createClient();
    const { data, error: otpError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    });

    if (otpError || !data.session || !data.user) {
      setError(t('error.invalidCode'));
      setLoading(false);
      // Clear boxes so user can re-enter
      setDigits(Array(LENGTH).fill(''));
      focus(0);
      return;
    }

    // Fill in the profile the handle_new_auth_user trigger already created.
    //
    // NARROW UPDATE, NEVER AN UPSERT, AND NEVER role OR status. The trigger
    // sets those correctly and protect_profile_fields guards them — a client
    // must not be in the business of asserting its own role.
    //
    // Only ever fills columns that are empty, so re-verifying, or a later
    // support edit, cannot be clobbered by whatever is left in this browser's
    // sessionStorage. Same COALESCE(existing, new) shape the booking RPC uses
    // on the customers table, and for the same reason.
    try {
      let pending: { first_name?: string; last_name?: string; phone?: string } = {};
      const raw = sessionStorage.getItem('pending_profile');
      if (raw) pending = JSON.parse(raw);

      const { data: existing } = await supabase
        .from('profiles')
        .select('email, first_name, last_name, phone')
        .eq('id', data.user.id)
        .maybeSingle();

      const patch: Record<string, string> = {};
      const fill = (
        column: 'email' | 'first_name' | 'last_name' | 'phone',
        value: string | null | undefined,
      ) => {
        const current = existing?.[column];
        if (value && !(typeof current === 'string' && current.trim() !== '')) {
          patch[column] = value;
        }
      };

      fill('email',      data.user.email ?? email);
      fill('first_name', pending.first_name);
      fill('last_name',  pending.last_name);
      fill('phone',      pending.phone);

      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        const { error: patchError } = await supabase
          .from('profiles').update(patch).eq('id', data.user.id);

        // profiles.phone is UNIQUE. 23505 means the number is on another
        // account — so retry WITHOUT it: the verification succeeded, the
        // session is valid, and refusing to save a first name because a phone
        // clashed would be the wrong thing to lose. Checkout asks for a number
        // again and reports the clash there, where there is a field to fix.
        if (patchError?.code === '23505' && 'phone' in patch) {
          console.warn('[otp] phone already on another profile — saving the rest', {
            profileId: data.user.id,
          });
          delete patch.phone;
          if (Object.keys(patch).length > 1) {
            await supabase.from('profiles').update(patch).eq('id', data.user.id);
          }
        }
      }

      sessionStorage.removeItem('pending_profile');
    } catch {
      // Non-fatal — the session is valid and they are signed in either way.
    }

    router.push(returnUrl || '/');
    router.refresh();
  }, [digits, email, returnUrl, t, router]);

  async function handleResend() {
    if (cooldown > 0) return;
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    if (!resendError) {
      setCooldown(60);
      timerRef.current = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
  }

  // ── Missing email guard ────────────────────────────────────────────────────
  if (missingEmail) {
    return (
      <div className="text-center py-4 flex flex-col gap-4">
        <p className="text-sm text-mute">{t('noEmail')}</p>
        <Link
          href="/sign-up"
          className="text-sm text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
        >
          {t('backToSignUp')}
        </Link>
      </div>
    );
  }

  // ── OTP form ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">

      {error && (
        <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error}
        </div>
      )}

      {/* OTP input boxes — always LTR regardless of locale */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">{t('codeLabel')}</span>
        <div dir="ltr" className="flex gap-2 justify-center">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={6}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={(e) => handlePaste(e, i)}
              onFocus={(e) => e.target.select()}
              aria-label={`${t('codeLabel')} ${i + 1}`}
              className="w-11 h-14 border border-rule rounded-[8px] text-center text-xl font-semibold text-ink bg-paper focus:outline-none focus:border-ink transition-colors duration-[240ms] caret-transparent"
            />
          ))}
        </div>
      </div>

      {/* Verify button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70 disabled:opacity-50"
      >
        {loading ? t('loading') : t('submit')}
      </button>

      {/* Resend */}
      <div className="text-center">
        {cooldown > 0 ? (
          <span className="text-sm text-mute tabular-nums">
            {t('resendIn', { seconds: cooldown })}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            className="text-sm text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
          >
            {t('resend')}
          </button>
        )}
      </div>
    </form>
  );
}
