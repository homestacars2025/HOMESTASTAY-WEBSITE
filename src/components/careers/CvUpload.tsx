'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Paperclip, X, FileText } from 'lucide-react';
import {
  CV_EXTENSIONS,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  humanFileSize,
} from '@/lib/careers/validate';
import type { CvPayload } from '@/lib/careers/types';

/**
 * The CV field.
 *
 * ⚠️ CHECKED BEFORE IT IS READ. Size and type are tested against the File
 * handle first; only then is the file read into memory. Reading 5 MB on a
 * mid-range phone and THEN refusing it is a second of jank for nothing.
 *
 * ⚠️ AND IT IS ONE FIELD, NOT TWO. A `file` entry in form_schema is drawn
 * here — its label, its required flag — but its value goes to the payload's
 * top-level `cv`, never to `answers`. See the Server Action's header.
 */

interface CvUploadProps {
  label: string;
  required: boolean;
  invalid: boolean;
  errorId: string;
  onChange: (cv: CvPayload | null, fileName: string | null) => void;
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return CV_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function CvUpload({ label, required, invalid, errorId, onChange }: CvUploadProps) {
  const t = useTranslations('careers.form');
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  function reset() {
    setFileName(null);
    setFileSize(0);
    setLocalError(null);
    if (inputRef.current) inputRef.current.value = '';
    onChange(null, null);
  }

  async function handleFile(file: File) {
    setLocalError(null);

    // ── Refuse BEFORE reading ────────────────────────────────────────────
    if (file.size > CV_MAX_BYTES) {
      setLocalError(t('cvTooLarge', { max: humanFileSize(CV_MAX_BYTES) }));
      reset();
      return;
    }

    // Extension AND mime, either satisfying the check: browsers send
    // application/octet-stream for .docx often enough that a mime-only rule
    // rejects real CVs.
    const mimeOk = (CV_MIME_TYPES as readonly string[]).includes(file.type);
    const extOk = hasAllowedExtension(file.name);
    if (!mimeOk && !extOk) {
      setLocalError(t('cvWrongType'));
      reset();
      return;
    }

    setReading(true);
    try {
      const base64 = await toBase64(file);
      setFileName(file.name);
      setFileSize(file.size);
      // The server re-checks the mime against its own list, so a file whose
      // type the browser could not name is sent as PDF only when its extension
      // says so — otherwise the extension decides.
      const mime = mimeOk ? file.type : mimeForExtension(file.name);
      onChange({ data: base64, mime }, file.name);
    } catch (err) {
      console.error('[careers/cv] could not read the file', err);
      setLocalError(t('cvReadFailed'));
      reset();
    } finally {
      setReading(false);
    }
  }

  const describedBy = [invalid ? errorId : null, localError ? `${errorId}-local` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-stay ms-0.5" aria-hidden> *</span>}
      </p>

      <input
        ref={inputRef}
        type="file"
        id="cv"
        accept={[...CV_EXTENSIONS, ...CV_MIME_TYPES].join(',')}
        className="sr-only"
        aria-invalid={invalid || localError !== null}
        aria-describedby={describedBy || undefined}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {fileName ? (
        <div className="flex items-center gap-3 rounded-[14px] border border-rule bg-paper-warm/50 px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-mute" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-ink" dir="ltr">{fileName}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
              {humanFileSize(fileSize)}
            </span>
          </span>
          <button
            type="button"
            onClick={reset}
            aria-label={t('cvRemove')}
            className="ms-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-mute transition-colors duration-[240ms] hover:bg-paper-warm hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={reading}
          className={
            'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border border-dashed px-4 py-4 text-sm transition-colors duration-[240ms] disabled:opacity-60 ' +
            (invalid || localError ? 'border-stay text-stay' : 'border-rule text-ink-soft hover:bg-paper-warm')
          }
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          {reading ? t('cvReading') : t('cvChoose')}
        </button>
      )}

      <p className="mt-1.5 text-xs leading-relaxed text-mute">
        {t('cvHint', { max: humanFileSize(CV_MAX_BYTES) })}
      </p>

      {localError && (
        <p id={`${errorId}-local`} role="alert" className="mt-1 text-xs text-stay">
          {localError}
        </p>
      )}
    </div>
  );
}

/** Last resort when the browser gave no usable type. Extension already validated. */
function mimeForExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/msword';
}

/**
 * File → base64, without the `data:...;base64,` prefix.
 *
 * FileReader rather than arrayBuffer + btoa: the latter needs a binary string
 * built one character at a time, which blows the call stack on a multi-megabyte
 * file (String.fromCharCode.apply has an argument limit).
 */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('unexpected reader result'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
