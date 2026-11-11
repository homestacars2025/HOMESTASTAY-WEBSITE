'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * False on the server and during hydration, true after. Times are formatted
 * only once this is true: the server renders in UTC, and a hydrated text node
 * keeps the server's string — so an Istanbul guest would read times 3 h off.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
