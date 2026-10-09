import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * "Continue with email" / "Continue with phone" under the auth card.
 *
 * The method lives in the URL (?method=email), not in client state: the page
 * renders the right form on the server, the back button undoes the switch,
 * and a link from elsewhere — "this email has an account, sign in with it" —
 * can open the email form directly.
 */
export async function MethodSwitchLink({
  page,
  current,
  returnUrl,
}: {
  page: '/sign-in' | '/sign-up';
  current: 'phone' | 'email';
  returnUrl?: string;
}) {
  const t = await getTranslations('auth.method');
  const query: Record<string, string> = {};
  if (current === 'phone') query.method = 'email';
  if (returnUrl) query.returnUrl = returnUrl;

  return (
    <p className="mt-6 text-center text-sm">
      <Link
        href={{ pathname: page, query }}
        className="inline-flex min-h-11 items-center text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
      >
        {t(current === 'phone' ? 'useEmail' : 'usePhone')}
      </Link>
    </p>
  );
}
