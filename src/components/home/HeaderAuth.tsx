'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuthUser } from '@/hooks/useAuthUser';
import { UserMenu } from './UserMenu';

export function HeaderAuth() {
  const t    = useTranslations('nav');
  const user = useAuthUser();

  // Still checking session — hold space to prevent layout shift
  if (user === undefined) {
    return <div className="h-9 w-[192px] rounded-[999px] bg-paper-warm" aria-hidden="true" />;
  }

  if (user !== null) {
    return <UserMenu user={user} />;
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/sign-in"
        className="rounded-[999px] border border-rule text-sm font-medium text-ink px-4 py-2 hover:bg-paper-warm transition-colors duration-[240ms]"
      >
        {t('signIn')}
      </Link>
      <Link
        href="/sign-up"
        className="rounded-[999px] bg-ink text-white text-sm font-medium px-4 py-2 transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70"
      >
        {t('createAccount')}
      </Link>
    </div>
  );
}
