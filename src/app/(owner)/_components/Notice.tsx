import { BrandMark } from '@/components/brand/BrandMark';

type Tone = 'success' | 'warning' | 'neutral' | 'error';

const TONE_RING: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  neutral: 'bg-paper-warm text-ink-soft',
  error: 'bg-stay/10 text-stay',
};

/**
 * Terminal panel for every non-actionable outcome — invalid link, already
 * decided, expired, no longer on hold, success, failure.
 *
 * No directive: it holds no state and imports nothing server-only, so both the
 * server pages and the client confirm form can render it.
 */
export function Notice({
  tone,
  title,
  body,
  detail,
}: {
  tone: Tone;
  title: string;
  body: string;
  detail?: string | null;
}) {
  return (
    <div className="text-center py-6">
      <div
        className={`w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center ${TONE_RING[tone]}`}
        aria-hidden="true"
      >
        <BrandMark className="w-5 h-5" />
      </div>
      <h1 className="text-xl font-medium tracking-[-0.025em] text-ink mb-2">{title}</h1>
      <p className="text-sm text-ink-soft leading-relaxed">{body}</p>
      {detail && <p className="mt-3 text-xs text-mute">{detail}</p>}
    </div>
  );
}
