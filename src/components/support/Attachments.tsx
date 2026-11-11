'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Music, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signAttachments } from '@/lib/support/client';
import {
  ACCEPTED_TYPES,
  MAX_FILES,
  attachmentKind,
  fileProblem,
  formatBytes,
  type SupportAttachment,
} from '@/lib/support/model';

// ── Picking ──────────────────────────────────────────────────────────────────

/**
 * Files the bucket will take (type + 15 MB), up to MAX_FILES. What it refuses
 * is reported as a sentence the guest can act on, not dropped silently.
 */
export function useFilePicker() {
  const t = useTranslations('support.files');
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    let msg: string | null = null;
    for (const f of Array.from(list)) {
      const p = fileProblem(f);
      if (p) {
        msg = t(p === 'size' ? 'tooBig' : 'badType', { name: f.name });
        continue;
      }
      if (next.length >= MAX_FILES) {
        msg = t('tooMany', { max: MAX_FILES });
        break;
      }
      next.push(f);
    }
    setFiles(next);
    setProblem(msg);
  };

  return {
    files,
    problem,
    add,
    remove: (i: number) => {
      setFiles((fs) => fs.filter((_, j) => j !== i));
      setProblem(null);
    },
    clear: () => {
      setFiles([]);
      setProblem(null);
    },
  };
}

/** The paperclip: an icon button in the composer, a labelled pill in the form. */
export function AttachButton({
  onPick,
  disabled,
  variant = 'icon',
}: {
  onPick: (l: FileList | null) => void;
  disabled?: boolean;
  variant?: 'icon' | 'text';
}) {
  const t = useTranslations('support.files');
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={[...ACCEPTED_TYPES, '.heic'].join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = ''; // the same file can be picked again after removing it
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label={t('attach')}
        className={cn(
          'shrink-0 inline-flex items-center justify-center text-ink border border-rule rounded-full transition-colors duration-[240ms] hover:bg-paper-warm disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
          variant === 'icon' ? 'w-11 h-11' : 'min-h-[44px] gap-2 px-4 text-sm font-medium',
        )}
      >
        <Paperclip className="w-[18px] h-[18px]" aria-hidden="true" />
        {variant === 'text' && t('attach')}
      </button>
    </>
  );
}

/** The files about to be sent — a thumbnail for photos — each removable. */
export function PendingFiles({ files, onRemove, disabled }: { files: File[]; onRemove: (i: number) => void; disabled?: boolean }) {
  const t = useTranslations('support.files');
  const locale = useLocale();
  const previews = useMemo(
    () => files.map((f) => (/^image\/(jpeg|png|webp)$/.test(f.type) ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.size}-${i}`} className="flex max-w-[240px] items-center gap-2 rounded-[12px] border border-rule bg-white py-1 ps-1 pe-1.5">
          {previews[i] ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview of a file not uploaded yet
            <img src={previews[i]!} alt="" width={36} height={36} className="w-9 h-9 shrink-0 rounded-[8px] object-cover" />
          ) : (
            <span className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[8px] bg-paper-warm">
              <FileText className="w-4 h-4 text-ink-soft" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-xs text-ink"><bdi>{f.name}</bdi></span>
            <span className="block text-[11px] text-mute tabular-nums">{formatBytes(f.size, locale)}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            disabled={disabled}
            aria-label={t('remove', { name: f.name })}
            className="shrink-0 rounded-full w-8 h-8 inline-flex items-center justify-center text-ink-soft hover:bg-paper-warm disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Showing ──────────────────────────────────────────────────────────────────

/**
 * Signed URLs (1 h) for files in the private bucket, asked once per path for
 * the life of the view — longer than anyone keeps a chat open.
 */
export function useSignedUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const key = paths.join('|');
  useEffect(() => {
    const missing = key ? key.split('|').filter((p) => !asked.current.has(p)) : [];
    if (!missing.length) return;
    missing.forEach((p) => asked.current.add(p));
    void signAttachments(missing).then((got) => setUrls((u) => ({ ...u, ...got })));
  }, [key]);
  return urls;
}

/**
 * A message's files. Photos as thumbnails whose box is reserved from the
 * stored width/height (no layout shift as they load), video and audio inline
 * with native controls, everything else as a file chip. Photos and files open
 * full size in a new tab.
 */
export function AttachmentGrid({ attachments, urls, mine }: { attachments: SupportAttachment[]; urls: Record<string, string>; mine: boolean }) {
  const t = useTranslations('support.files');
  const locale = useLocale();
  if (!attachments.length) return null;

  const images = attachments.filter((a) => attachmentKind(a) === 'image');
  const rest = attachments.filter((a) => attachmentKind(a) !== 'image');

  return (
    <div className={cn('mt-1 flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
      {images.length > 0 && (
        <div className={cn('flex flex-wrap gap-1.5', mine && 'justify-end')}>
          {images.map((a) => {
            const url = urls[a.path];
            // A 176-px-wide box at the photo's own aspect ratio, clamped so a
            // panorama or a screenshot still fits a bubble.
            const ratio = a.width && a.height ? Math.min(Math.max(a.width / a.height, 0.6), 1.8) : 1;
            const style = { width: 176, aspectRatio: String(ratio) };
            return url ? (
              <a
                key={a.path}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-[14px] border border-rule bg-paper-warm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                style={style}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket; next/image would cache it under a token that expires */}
                <img src={url} alt={a.name || t('photo')} width={176} height={Math.round(176 / ratio)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </a>
            ) : (
              <span key={a.path} role="img" aria-label={t('loading')} className="block animate-pulse rounded-[14px] bg-paper-warm" style={style} />
            );
          })}
        </div>
      )}
      {rest.map((a) => {
        const url = urls[a.path];
        const kind = attachmentKind(a);
        if (kind === 'video' && url) {
          return (
            <video key={a.path} src={url} controls preload="metadata" playsInline className="w-[260px] max-w-full aspect-video rounded-[14px] border border-rule bg-ink" aria-label={a.name} />
          );
        }
        if (kind === 'audio' && url) {
          return (
            <div key={a.path} className="flex w-[260px] max-w-full items-center gap-2 rounded-[14px] border border-rule bg-white px-2 py-1.5">
              <Music className="w-4 h-4 shrink-0 text-ink-soft" aria-hidden="true" />
              <audio src={url} controls preload="none" className="h-9 min-w-0 flex-1" aria-label={a.name} />
            </div>
          );
        }
        return (
          <a
            key={a.path}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!url}
            className={cn(
              'flex max-w-[260px] items-center gap-2 rounded-[14px] border border-rule bg-white px-3 py-2 text-ink transition-colors duration-[240ms] hover:bg-paper-warm',
              !url && 'pointer-events-none opacity-60',
            )}
          >
            <FileText className="w-4 h-4 shrink-0 text-ink-soft" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-sm"><bdi>{a.name}</bdi></span>
              {a.size != null && <span className="block text-[11px] text-mute tabular-nums">{formatBytes(a.size, locale)}</span>}
            </span>
          </a>
        );
      })}
    </div>
  );
}
