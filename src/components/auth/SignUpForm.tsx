'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { PhoneInput } from './PhoneInput';

interface SignUpFormProps {
  returnUrl?: string;
}

export function SignUpForm({ returnUrl }: SignUpFormProps) {
  const t      = useTranslations('auth.signUp');
  const router = useRouter();

  const [firstName,       setFirstName]       = useState('');
  const [lastName,        setLastName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [phone,           setPhone]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,           setError]           = useState('');
  const [showSignInLink,  setShowSignInLink]  = useState(false);
  const [loading,         setLoading]         = useState(false);

  function validate(): string {
    if (!firstName.trim() || !email.trim() || !password) return t('error.requiredField');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('error.emailInvalid');
    if (password.length < 8) return t('error.passwordTooShort');
    if (password !== confirmPassword) return t('error.passwordMismatch');
    if (phone && !isValidPhoneNumber(phone)) return t('error.phoneInvalid');
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validate();
    if (msg) { setError(msg); setShowSignInLink(false); return; }

    setError('');
    setShowSignInLink(false);
    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name:  lastName.trim()  || null,
          phone:      phone             || null,
        },
      },
    });

    if (authError) {
      setError(t('error.generic'));
      setLoading(false);
      return;
    }

    if (data.user?.identities?.length === 0) {
      setError(t('error.emailAlreadyRegistered'));
      setShowSignInLink(true);
      setLoading(false);
      return;
    }

    // Store pending profile data for the OTP verification step
    sessionStorage.setItem(
      'pending_profile',
      JSON.stringify({
        first_name: firstName.trim() || null,
        last_name:  lastName.trim()  || null,
        phone:      phone             || null,
      })
    );

    if (data.session && data.user) {
      // Auto-confirm is on — create profile immediately and go home
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id:         data.user.id,
          email:      data.user.email ?? email,
          first_name: firstName.trim() || null,
          last_name:  lastName.trim()  || null,
          phone:      phone             || null,
          role:       'customer',
          status:     'active',
        },
        { onConflict: 'id', ignoreDuplicates: false }
      );

      // profiles.phone is UNIQUE — one number per account. 23505 here means
      // the number belongs to somebody else, and the account still exists
      // WITHOUT a phone. Said plainly and the flow stops: sending them on
      // would hide it until checkout asked for the number again.
      if (profileError?.code === '23505') {
        setError(t('error.phoneTaken'));
        setLoading(false);
        return;
      }
      if (profileError) {
        // The account is real and they are signed in; the profile row is the
        // trigger's job anyway. Loud, but not a dead end for the guest.
        console.error('[signUp] profile upsert failed', {
          message: profileError.message, code: profileError.code,
        });
      }

      sessionStorage.removeItem('pending_profile');
      router.push(returnUrl || '/');
      router.refresh();
    } else {
      // Email OTP confirmation required — go to verify-email page
      const verifyUrl = `/verify-email?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      router.push(verifyUrl);
    }
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

      {error && (
        <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error}
          {showSignInLink && (
            <>
              {' '}
              <Link
                href="/sign-in"
                className="font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
              >
                {t('signIn')}
              </Link>
            </>
          )}
        </div>
      )}

      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first-name" className="text-sm font-medium text-ink">
            {t('firstNameLabel')} <span className="text-stay" aria-hidden="true">*</span>
          </label>
          <input
            id="first-name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="last-name" className="text-sm font-medium text-ink">
            {t('lastNameLabel')}
          </label>
          <input
            id="last-name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]"
          />
        </div>
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          {t('emailLabel')} <span className="text-stay" aria-hidden="true">*</span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          required
          className="w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]"
        />
      </div>

      {/* Phone */}
      <PhoneInput
        value={phone}
        onChange={setPhone}
        defaultCountry="TR"
        label={t('phoneLabel')}
        searchPlaceholder={t('phoneSearchPlaceholder')}
      />

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          {t('passwordLabel')} <span className="text-stay" aria-hidden="true">*</span>
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]"
        />
      </div>

      {/* Confirm password */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium text-ink">
          {t('confirmPasswordLabel')} <span className="text-stay" aria-hidden="true">*</span>
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70 disabled:opacity-50"
      >
        {loading ? t('loading') : t('submit')}
      </button>

      {/* Cross-link */}
      <p className="text-center text-sm text-mute">
        {t('hasAccount')}{' '}
        <Link
          href="/sign-in"
          className="text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
        >
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
