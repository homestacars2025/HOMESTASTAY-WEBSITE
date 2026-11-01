/** ISO yyyy-mm-dd → local Date at midday (avoids a TZ shift rolling the day) — as BookingCard does. */
export function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
