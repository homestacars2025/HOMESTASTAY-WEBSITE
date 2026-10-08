import 'server-only';

/**
 * A small sliding-window limiter, in memory, per server instance.
 *
 * DEFENCE IN DEPTH ONLY. Instances do not share it, so it trims bursts that
 * land on one instance; the authoritative limits live in the database
 * (host_otp_start: 60 s between sends, 5 an hour; host_otp_verify: 5 wrong
 * tries → 15-minute lock). Keys are opaque strings — callers build them from
 * a user id or an IP, never from a code or a token.
 */
const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) {
    // Crude but bounded: drop the oldest half rather than grow without limit.
    for (const k of Array.from(hits.keys()).slice(0, MAX_KEYS / 2)) hits.delete(k);
  }
  return true;
}

/** The caller's IP as Vercel reports it, or 'unknown'. */
export function clientIp(headers: Headers): string {
  return headers.get('x-real-ip')
    ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

/** An IP shortened for logs: the network part only, never the full address. */
export function ipForLog(ip: string): string {
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.x';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::x';
  return ip;
}
