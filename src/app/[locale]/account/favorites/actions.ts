'use server';

import { routing } from '@/i18n/routing';
import { getStaysCatalogue, type StayCard } from '@/lib/queries/stays';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cards for saved unit ids, in the order given — from the cached public
 * catalogue, so this reads nothing private and costs no query inside its
 * cache window. Units no longer listed are simply left out.
 */
export async function favoriteCards(locale: string, ids: string[]): Promise<StayCard[]> {
  const loc = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const wanted = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 200);
  if (!wanted.length) return [];
  const byId = new Map((await getStaysCatalogue(loc, {})).map((c) => [c.id, c]));
  return wanted.flatMap((id) => {
    const card = byId.get(id);
    return card ? [{ ...card, long_stay_min: null }] : [];
  });
}
