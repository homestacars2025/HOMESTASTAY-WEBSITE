'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

/**
 * next/image wrapper with a transform-failure fallback.
 *
 * All Supabase images normally route through the render/image transform endpoint
 * (see src/lib/image-loader.ts). That endpoint rejects source files above its
 * size limit with a 400 ("source image file is too large to process") — e.g. an
 * un-compressed 28 MB phone photo. When that happens, next/image renders nothing
 * and the card/gallery goes blank.
 *
 * On the first load error we re-render with `unoptimized`, which serves the
 * original object URL directly (the raw /object/public/ file returns 200). The
 * image is heavier than an optimized one, but it shows instead of being blank.
 * The real fix is compressing/resizing originals at upload time.
 */
export function SmartImage(props: ImageProps) {
  const [failed, setFailed] = useState(false);

  return (
    <Image
      {...props}
      unoptimized={props.unoptimized || failed}
      onError={(e) => {
        if (!failed) setFailed(true);
        props.onError?.(e);
      }}
    />
  );
}
