'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cross-platform country flag. Emoji flags are not rendered on Windows and
 * external flag CDNs may be blocked, so flags are bundled under /public/flags.
 */
export function CountryFlag({
  code,
  size = 20,
  className,
}: {
  code?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!code || code.length !== 2 || failed) {
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        aria-hidden
      >
        🌐
      </span>
    );
  }

  const lower = code.toLowerCase();
  return (
    <img
      src={`/flags/${lower}.svg`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={code.toUpperCase()}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        'inline-block shrink-0 rounded-[2px] object-cover shadow-sm ring-1 ring-black/5',
        className,
      )}
    />
  );
}
