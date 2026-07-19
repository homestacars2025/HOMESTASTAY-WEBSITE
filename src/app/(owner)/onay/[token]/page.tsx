import type { Metadata } from 'next';
import { DecisionPage } from '@/app/(owner)/_components/DecisionPage';

// Never prerendered, never cached: this page renders one owner's booking, keyed
// on a secret in the URL. A cached response is a response served to the wrong
// person.
export const dynamic = 'force-dynamic';

// Repeated from the layout rather than inherited, so that moving or copying
// this route cannot silently drop them.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function OnayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <DecisionPage token={token} mode="approve" />;
}
