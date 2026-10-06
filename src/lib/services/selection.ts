import type { ServiceSelection, UnitService } from '@/lib/services/types';

/**
 * The extras a guest picked, carried in the checkout URL as
 *   &svc=<unit_service_id>:<qty>,<unit_service_id>:<qty>
 * the same way the dates are: shareable, resumable, back-button-safe.
 *
 * A URL is user input, so every reader re-validates. No prices ever travel
 * here — the database prices whatever ids and quantities survive.
 */

export const SERVICE_QTY_MIN = 1;
export const SERVICE_QTY_MAX = 20;
/** More distinct extras than any unit offers; a longer list is not a real one. */
export const SERVICE_SELECTIONS_MAX = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSelection(s: unknown): s is ServiceSelection {
  if (!s || typeof s !== 'object') return false;
  const { unit_service_id: id, quantity: qty } = s as Record<string, unknown>;
  return typeof id === 'string' && UUID_RE.test(id)
    && typeof qty === 'number' && Number.isInteger(qty)
    && qty >= SERVICE_QTY_MIN && qty <= SERVICE_QTY_MAX;
}

/**
 * Strict validation for a selection crossing a server boundary (Server Action
 * input). Null when anything is malformed — the caller refuses rather than
 * quietly booking a different set of extras than the guest saw.
 */
export function validateSelections(input: unknown): ServiceSelection[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > SERVICE_SELECTIONS_MAX) return null;
  const seen = new Set<string>();
  const out: ServiceSelection[] = [];
  for (const s of input) {
    if (!isValidSelection(s)) return null;
    const id = s.unit_service_id.toLowerCase();
    if (seen.has(id)) return null;
    seen.add(id);
    out.push({ unit_service_id: id, quantity: s.quantity });
  }
  return out;
}

/** "&svc=" value → selections. Lenient: a malformed entry is dropped, not fatal. */
export function parseSvcParam(raw: string | string[] | undefined): ServiceSelection[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [];
  const seen = new Set<string>();
  const out: ServiceSelection[] = [];
  for (const part of value.split(',')) {
    if (out.length >= SERVICE_SELECTIONS_MAX) break;
    const [id, qtyRaw] = part.split(':');
    const qty = Number(qtyRaw);
    const candidate = { unit_service_id: (id ?? '').trim().toLowerCase(), quantity: qty };
    if (!isValidSelection(candidate) || seen.has(candidate.unit_service_id)) continue;
    seen.add(candidate.unit_service_id);
    out.push(candidate);
  }
  return out;
}

export function formatSvcParam(selections: ServiceSelection[]): string {
  return selections.map((s) => `${s.unit_service_id}:${s.quantity}`).join(',');
}

/** Upper bound for one service's quantity: per_item up to max_quantity, else exactly 1. */
export function maxQuantityFor(service: UnitService): number {
  return service.pricing_unit === 'per_item'
    ? Math.min(service.max_quantity ?? 1, SERVICE_QTY_MAX)
    : 1;
}

/**
 * Keep only extras this unit actually offers, with quantities it accepts.
 * Run on the checkout page against public_unit_services, so a stale or edited
 * link can neither book a service the unit dropped nor exceed max_quantity.
 */
export function normalizeSelections(
  selections: ServiceSelection[],
  services: UnitService[],
): ServiceSelection[] {
  const byId = new Map(services.map((s) => [s.id.toLowerCase(), s]));
  const out: ServiceSelection[] = [];
  for (const sel of selections) {
    const service = byId.get(sel.unit_service_id.toLowerCase());
    if (!service) continue;
    out.push({ unit_service_id: service.id, quantity: Math.min(sel.quantity, maxQuantityFor(service)) });
  }
  return out;
}
