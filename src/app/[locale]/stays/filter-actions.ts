'use server';

import { countPublicUnits } from '@/lib/queries/stays';
import { parseStaysSearchParams } from '@/lib/stays/search-params';
import type { AmenityFilter } from '@/lib/stays/filters';

/**
 * Live result count for the filter sheet while a guest adjusts it.
 *
 * Takes the draft as a /stays query string and runs it through the same
 * parser the page uses — the one validation boundary for every filter value —
 * so nothing reaches the query that a hand-edited URL couldn't. Returns counts
 * only: no ids, no prices, no unit data.
 */
export async function countStaysAction(
  query: string,
): Promise<{ total: number; amenityCounts: Record<AmenityFilter, number> }> {
  const raw = typeof query === 'string' ? query.slice(0, 2000) : '';
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  return countPublicUnits(parseStaysSearchParams(params));
}
