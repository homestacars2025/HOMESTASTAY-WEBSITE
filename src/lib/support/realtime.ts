'use client';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribe to postgres_changes AS THE SIGNED-IN GUEST, and return the cleanup.
 *
 * ⚠️ TWO TRAPS, BOTH VERIFIED AGAINST THE LIVE PROJECT (2026-11-11):
 *
 * 1. A channel joined before the browser client has loaded its session joins
 *    with NO access token. Realtime then checks each row against RLS as anon,
 *    sees nothing, and delivers nothing — while the join itself still answers
 *    "Subscribed to PostgreSQL". So the session is read and handed to the
 *    realtime socket first, and only then is the channel joined.
 *
 * 2. supabase.channel(topic) returns an EXISTING channel with that topic. When
 *    an effect re-runs (Strict Mode, a remount), the old channel's async
 *    removal races the new subscribe and the view is left with none. Every
 *    topic therefore gets a unique suffix.
 */
export function subscribeAsUser(
  name: string,
  build: (channel: RealtimeChannel) => RealtimeChannel,
): () => void {
  const supabase: SupabaseClient = createClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void supabase.auth.getSession().then(async ({ data }) => {
    if (cancelled || !data.session) return;
    await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return;
    channel = build(supabase.channel(`${name}-${crypto.randomUUID()}`)).subscribe();
  });

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
