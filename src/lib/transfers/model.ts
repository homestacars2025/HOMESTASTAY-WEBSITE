/**
 * Airport transfers — the shapes the Stay database's transfer RPCs answer
 * with, and the small rules the UI needs. Client-safe (no secrets).
 *
 * The contracts are the ones the app client uses (HOMESTA-APP-apple
 * src/features/transfer/api.ts, "as agreed", 21 Nov 2026); every reader here
 * is defensive the same way, so a renamed or missing field degrades to "not
 * shown" instead of a crash. The SQL is not in any repo.
 *
 *   • one fixed price per route, one vehicle class, FULL payment only;
 *   • prices are USD in the database; TRY is what the bank charges, computed
 *     by the database (transfer_payment_init) — never by this code;
 *   • times are Istanbul time (UTC+3 all year, no DST since 2016).
 */

export type Airport = 'IST' | 'SAW';
export type Direction = 'arrival' | 'departure';
export type Lang = 'en' | 'ar' | 'tr' | 'ru';

export const AIRPORTS: Airport[] = ['IST', 'SAW'];
export const DIRECTIONS: Direction[] = ['arrival', 'departure'];

export interface LocalizedName { name_en?: string; name_ar?: string; name_tr?: string; name_ru?: string }

export interface TransferOptions {
  currency: string;
  tryRate: number | null;
  minLeadHours: number;
  freeCancelHours: number;
  maxPassengers: number;
  maxLuggage: number;
  maxChildSeats: number;
  airports: ({ code: Airport; lat: number | null; lng: number | null } & LocalizedName)[];
  districts: { id: string; name: string; zone: string; priceFrom: Partial<Record<Airport, number>> }[];
}

/** The agreed values, used only when the database leaves one out. */
export const OPTION_DEFAULTS = { minLeadHours: 4, freeCancelHours: 24, maxPassengers: 6, maxLuggage: 8, maxChildSeats: 2 };

export interface TransferView {
  id: string;
  reference: string | null;
  status: string;
  direction: Direction | null;
  airport: Airport | null;
  district: string | null;
  address: string | null;
  pickupAt: string | null;
  flightNumber: string | null;
  passengers: number | null;
  luggage: number | null;
  childSeats: number | null;
  notes: string | null;
  priceUsd: number | null;
  paidAt: string | null;
  paymentExpiresAt: string | null;
  canPay: boolean;
  canCancel: boolean;
  freeCancelUntil: string | null;
  createdAt: string | null;
  driver: { name: string | null; whatsapp: string | null } | null;
  vehicle: { model: string | null; color: string | null; plate: string | null } | null;
}

// ── Status groups ────────────────────────────────────────────────────────────
// The app and the staff side name a few states differently (en_route vs
// on_the_way, cancelled vs canceled); both spellings are accepted everywhere.

export const AWAITING_PAYMENT = new Set(['pending_payment']);
export const PAID_STATES = new Set([
  'paid', 'unassigned', 'offered', 'assigned', 'en_route', 'on_the_way', 'arrived', 'picked_up', 'completed', 'no_show',
]);
export const LIVE_STATES = new Set(['paid', 'unassigned', 'offered', 'assigned', 'en_route', 'on_the_way', 'arrived', 'picked_up']);
export const CLOSED_STATES = new Set([
  'completed', 'refund_pending', 'refunded', 'cancelled', 'canceled', 'expired', 'payment_expired', 'payment_failed', 'no_show',
]);

/** The one status label key for a raw status (both spellings fold together). */
export function statusKey(status: string): string {
  switch (status) {
    case 'on_the_way': return 'en_route';
    case 'canceled': return 'cancelled';
    case 'payment_expired': return 'expired';
    default: return status;
  }
}

// ── Readers ──────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const isAirport = (v: unknown): v is Airport => v === 'IST' || v === 'SAW';

export function parseOptions(raw: unknown): TransferOptions | null {
  const d = rec(raw);
  if (!Array.isArray(d.airports) || !Array.isArray(d.districts)) return null;
  return {
    currency: str(d.currency) ?? 'USD',
    tryRate: num(d.try_rate),
    minLeadHours: num(d.min_lead_hours) ?? OPTION_DEFAULTS.minLeadHours,
    freeCancelHours: num(d.free_cancel_hours) ?? OPTION_DEFAULTS.freeCancelHours,
    maxPassengers: num(d.max_passengers) ?? OPTION_DEFAULTS.maxPassengers,
    maxLuggage: num(d.max_luggage) ?? OPTION_DEFAULTS.maxLuggage,
    maxChildSeats: num(d.max_child_seats) ?? OPTION_DEFAULTS.maxChildSeats,
    airports: (d.airports as unknown[]).map(rec).filter((a) => isAirport(a.code)).map((a) => ({
      code: a.code as Airport, lat: num(a.lat), lng: num(a.lng),
      name_en: str(a.name_en) ?? undefined, name_ar: str(a.name_ar) ?? undefined,
      name_tr: str(a.name_tr) ?? undefined, name_ru: str(a.name_ru) ?? undefined,
    })),
    districts: (d.districts as unknown[]).map(rec).filter((x) => str(x.id) && str(x.name)).map((x) => {
      const pf = rec(x.price_from);
      const priceFrom: Partial<Record<Airport, number>> = {};
      for (const a of AIRPORTS) { const p = num(pf[a]); if (p !== null) priceFrom[a] = p; }
      return { id: x.id as string, name: x.name as string, zone: str(x.zone) ?? '', priceFrom };
    }),
  };
}

export function parseTransfer(raw: unknown): TransferView | null {
  const outer = rec(raw);
  const t = Object.keys(rec(outer.transfer)).length ? rec(outer.transfer) : outer;
  const id = str(t.id) ?? str(t.transfer_id);
  if (!id) return null;
  const drv = rec(t.driver);
  const veh = rec(t.vehicle);
  const districtRaw = t.district;
  const dir = t.direction === 'arrival' || t.direction === 'departure' ? t.direction : null;
  // Airport: explicit, else the airport end of from/to.
  const from = rec(t.from);
  const to = rec(t.to);
  const airport = isAirport(t.airport) ? t.airport : isAirport(from.code) ? from.code : isAirport(to.code) ? to.code : null;
  return {
    id,
    reference: str(t.reference),
    status: str(t.status) ?? 'unknown',
    direction: dir,
    airport,
    district: typeof districtRaw === 'string' ? districtRaw : str(rec(districtRaw).name),
    address: str(t.address) ?? str(t.pickup_address) ?? str(t.dropoff_address),
    pickupAt: str(t.pickup_at),
    flightNumber: str(t.flight_number),
    passengers: num(t.passengers),
    luggage: num(t.luggage),
    childSeats: num(t.child_seats),
    notes: str(t.notes),
    priceUsd: num(t.price_usd),
    paidAt: str(t.paid_at),
    paymentExpiresAt: str(t.payment_expires_at),
    canPay: t.can_pay === true,
    canCancel: t.can_cancel === true,
    freeCancelUntil: str(t.free_cancel_until),
    createdAt: str(t.created_at),
    driver: Object.keys(drv).length ? { name: str(drv.name), whatsapp: str(drv.whatsapp) } : null,
    vehicle: Object.keys(veh).length ? { model: str(veh.model), color: str(veh.color), plate: str(veh.plate) } : null,
  };
}

/** my_transfers: a bare array or {transfers|items|data:[…]} — both accepted. */
export function parseTransferList(raw: unknown): TransferView[] {
  const d = rec(raw);
  const list = Array.isArray(raw) ? raw : (d.transfers ?? d.items ?? d.data);
  return Array.isArray(list) ? list.map(parseTransfer).filter((x): x is TransferView => x !== null) : [];
}

// ── Names & time ─────────────────────────────────────────────────────────────

export function localName(n: LocalizedName | undefined, lang: string, fallback = ''): string {
  if (!n) return fallback;
  const key = `name_${lang}` as keyof LocalizedName;
  return n[key] ?? n.name_en ?? fallback;
}

export const ISTANBUL_TZ = 'Europe/Istanbul';

/** "2026-12-03" + "14:30" (Istanbul) → ISO with the +03:00 offset the database expects. */
export function istanbulIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return `${date}T${time}:00+03:00`;
}

/** Long, human date-time in Istanbul time, in the visitor's language. */
export function formatIstanbul(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: ISTANBUL_TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function formatMoney(amount: number | null, currency: 'USD' | 'TRY', locale: string): string {
  if (amount === null) return '';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: currency === 'TRY' ? 2 : 0, minimumFractionDigits: currency === 'TRY' ? 2 : 0 }).format(amount);
}

export const TRANSFER_ORDER_PREFIX = 'TRF';
/** The shared bank callback's routing rule: TRF… is a transfer, everything else is not. */
export function isTransferOrder(merchantOrderId: string): boolean {
  return merchantOrderId.startsWith(TRANSFER_ORDER_PREFIX);
}

export const E164_RE = /^\+[1-9][0-9]{6,14}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
