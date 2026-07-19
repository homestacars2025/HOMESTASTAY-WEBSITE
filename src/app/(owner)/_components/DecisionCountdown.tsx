'use client';

import { useEffect, useState } from 'react';

interface DecisionCountdownProps {
  /** ISO 8601 deadline. */
  dueAt: string;
  labels: {
    /** "Karar için kalan süre" */
    title: string;
    /** "{hours} saat {minutes} dakika" */
    hours: string;
    /** "{minutes} dakika {seconds} saniye" */
    minutes: string;
    /** "Süre doldu" */
    over: string;
  };
}

function format(msLeft: number, labels: DecisionCountdownProps['labels']): string {
  if (msLeft <= 0) return labels.over;

  const totalSeconds = Math.floor(msLeft / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Under an hour the seconds matter to the owner; above it they are noise.
  return hours > 0
    ? labels.hours.replace('{hours}', String(hours)).replace('{minutes}', String(minutes))
    : labels.minutes.replace('{minutes}', String(minutes)).replace('{seconds}', String(seconds));
}

/**
 * Live countdown to the owner decision deadline.
 *
 * Renders nothing on the server pass. A clock rendered during SSR is stale by
 * the time it reaches the phone and would hydrate to a different string, so the
 * first value is computed in the effect instead. The reserved min-height keeps
 * that from shifting the layout (Law 1: no CLS).
 */
export function DecisionCountdown({ dueAt, labels }: DecisionCountdownProps) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const deadline = Date.parse(dueAt);
    if (!Number.isFinite(deadline)) return;

    const tick = () => setText(format(deadline - Date.now(), labels));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dueAt, labels]);

  return (
    <div className="text-center min-h-[3.25rem]">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-1">
        {labels.title}
      </p>
      <p className="text-lg font-medium tabular-nums text-ink" aria-live="polite">
        {text ?? ' '}
      </p>
    </div>
  );
}
