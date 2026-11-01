import { getTranslations } from 'next-intl/server';
import { Mail, Smartphone } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * "Continue with email" / "Continue with phone" — a full button under "or",
 * the same shape, size and weight as "Continue with Google" beside it, so the
 * three ways in read as equals (no small text link to hunt for).
 *
 * The method lives in the URL (?method=email): the page renders the right form
 * on the server, the back button undoes the switch, and a link from elsewhere
 * ("this number belongs to an email account") can open the email form directly.
 */
export async function MethodSwitchButton({
  page,
  to,
  returnUrl,
}: {
  page: '/sign-in' | '/sign-up';
  to: 'email' | 'phone';
  returnUrl?: string;
}) {
  const t = await getTranslations('auth.method');
  const query: Record<string, string> = {};
  if (to === 'email') query.method = 'email';
  if (returnUrl) query.returnUrl = returnUrl;
  const Icon = to === 'email' ? Mail : Smartphone;

  return (
    <Link
      href={{ pathname: page, query }}
      className="w-full flex items-center justify-center gap-2.5 rounded-[999px] border border-rule bg-paper text-ink text-sm font-medium py-3 transition-colors duration-[240ms] hover:bg-paper-warm"
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {t(to === 'email' ? 'continueWithEmail' : 'continueWithPhone')}
    </Link>
  );
}
