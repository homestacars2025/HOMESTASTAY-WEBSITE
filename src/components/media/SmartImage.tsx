'use client';

import Image, { type ImageProps } from 'next/image';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { withImageHost } from '@/lib/image-loader';

/**
 * next/image wrapper with a transform-failure fallback and a load-in fade.
 *
 * TRANSFORM FAILURE
 *   All Supabase images normally route through the render/image transform
 *   endpoint (see src/lib/image-loader.ts). That endpoint rejects source files
 *   above its size limit with a 400 ("source image file is too large to
 *   process") — e.g. an un-compressed 28 MB phone photo. When that happens,
 *   next/image renders nothing and the card/gallery goes blank.
 *
 *   On the first load error we re-render with `unoptimized`, which serves the
 *   original object URL directly (the raw /object/public/ file returns 200).
 *   The image is heavier than an optimized one, but it shows instead of being
 *   blank. The real fix is compressing/resizing originals at upload time.
 *
 * THE FADE
 *   An image that pops in at full opacity the instant it decodes reads as a
 *   jolt; the same image fading over one motion beat reads as intentional. This
 *   is the substitute for next/image's `placeholder="blur"`, which needs a
 *   per-image blurDataURL that nothing in the pipeline produces — the container
 *   underneath carries a warm-paper fill, so the fade goes from brand surface
 *   to photograph rather than from white void to photograph.
 *
 * WHY THE REF, NOT JUST onLoad
 *   A cached image can finish decoding before React attaches the handler, and
 *   then onLoad never fires and the picture stays at opacity 0 forever. The ref
 *   checks `complete` on mount, which is true exactly in that case.
 */
export function SmartImage({ className, onError, ...props }: ImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const ref = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoaded(true);
  }, []);

  // The fallback path bypasses the loader by definition — `unoptimized` serves
  // `src` verbatim — so the CDN host has to be applied here too. These are the
  // heaviest images on the site (the ones the transform refused), which makes
  // them the ones that least deserve a round trip to Korea. No-op when no CDN
  // is configured, and for any src that is not Supabase Storage.
  const src = failed && typeof props.src === 'string' ? withImageHost(props.src) : props.src;

  return (
    <Image
      {...props}
      src={src}
      ref={ref}
      unoptimized={props.unoptimized || failed}
      onLoad={(e) => {
        setLoaded(true);
        props.onLoad?.(e);
      }}
      onError={(e) => {
        if (!failed) setFailed(true);
        onError?.(e);
      }}
      className={cn(
        'transition-opacity duration-[240ms]',
        loaded ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  );
}
