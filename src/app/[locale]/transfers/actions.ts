'use server';

import { createClient } from '@/lib/supabase/server';
import { createTransfer, quoteTransfer, type QuoteResult } from '@/lib/transfers/server';
import { E164_RE, UUID_RE, istanbulIso, type Airport, type Direction } from '@/lib/transfers/model';
import { allow } from '@/lib/security/rate-limit';

/**
 * The booking page's two server calls. Validation here is the server
 * boundary (CLAUDE.md §10); the database validates again (transfer_create
 * answers invalid {field} / too_soon / not_served) and sets the price — no
 * amount ever travels from the browser.
 */

const isAirport = (v: unknown): v is Airport => v === 'IST' || v === 'SAW';
const isDirection = (v: unknown): v is Direction => v === 'arrival' || v === 'departure';

export async function quoteTransferAction(airport: string, direction: string, districtId: string): Promise<QuoteResult> {
  if (!isAirport(airport) || !isDirection(direction) || !UUID_RE.test(districtId)) return { status: 'not_served' };
  return quoteTransfer(airport, direction, districtId);
}

export interface BookInput {
  airport: string;
  direction: string;
  districtId: string;
  address: string;
  date: string;
  time: string;
  flightNumber: string;
  passengers: number;
  luggage: number;
  childSeats: number;
  name: string;
  phone: string;
  notes: string;
  lang: string;
  stayBookingId?: string;
}

export type BookResult =
  | { status: 'ok'; transferId: string }
  | { status: 'auth_required' | 'not_served' | 'rate_limited' | 'error' }
  | { status: 'too_soon'; minLeadHours: number | null }
  | { status: 'invalid'; field: string | null };

const LANGS = new Set(['en', 'ar', 'tr', 'ru']);
const int = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);

export async function createTransferAction(input: BookInput): Promise<BookResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The email is the account's — verified, never typed here.
  if (!user || !user.email || !user.email_confirmed_at) return { status: 'auth_required' };

  if (!allow(`transfer-create:${user.id}`, 10, 60 * 60 * 1000)) return { status: 'rate_limited' };

  if (!isAirport(input.airport)) return { status: 'invalid', field: 'airport' };
  if (!isDirection(input.direction)) return { status: 'invalid', field: 'direction' };
  if (!UUID_RE.test(input.districtId)) return { status: 'invalid', field: 'district_id' };
  const pickupAt = istanbulIso(input.date, input.time);
  if (!pickupAt) return { status: 'invalid', field: 'pickup_at' };
  const passengers = int(input.passengers, 1, 50);
  const luggage = int(input.luggage, 0, 50);
  const childSeats = int(input.childSeats, 0, 10);
  if (passengers === null) return { status: 'invalid', field: 'passengers' };
  if (luggage === null) return { status: 'invalid', field: 'luggage' };
  if (childSeats === null) return { status: 'invalid', field: 'child_seats' };
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { status: 'invalid', field: 'contact_name' };
  const phone = input.phone.trim();
  if (!E164_RE.test(phone)) return { status: 'invalid', field: 'contact_phone' };
  const flight = input.flightNumber.replace(/\s+/g, '').toUpperCase().slice(0, 12);
  if (flight && !/^[A-Z0-9]{2,3}[0-9]{1,5}[A-Z]?$/.test(flight)) return { status: 'invalid', field: 'flight_number' };

  const result = await createTransfer(supabase, {
    direction: input.direction,
    airport: input.airport,
    district_id: input.districtId,
    address: input.address.trim().slice(0, 300) || undefined,
    pickup_at: pickupAt,
    flight_number: flight || undefined,
    passengers,
    luggage,
    child_seats: childSeats,
    notes: input.notes.trim().slice(0, 1000) || undefined,
    contact_name: name,
    contact_phone: phone,
    contact_email: user.email,
    lang: LANGS.has(input.lang) ? input.lang : 'en',
    stay_booking_id: input.stayBookingId && UUID_RE.test(input.stayBookingId) ? input.stayBookingId : undefined,
  });

  if (result.status === 'ok') return { status: 'ok', transferId: result.transferId };
  return result;
}
