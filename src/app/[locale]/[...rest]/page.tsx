import { notFound } from 'next/navigation';

/**
 * Any path under a locale that no route matches. Calling notFound() here is
 * what makes Next render [locale]/not-found.tsx INSIDE the locale layout —
 * translated, with the header — instead of its bare default 404 page.
 * Real routes always win over a catch-all, so nothing existing is shadowed.
 */
export default function CatchAll() {
  notFound();
}
