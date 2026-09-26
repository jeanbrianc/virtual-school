import { useEffect, useState } from 'react';
import type { AvatarConfig } from '../../domain/types';

/** Lazily renders the 3D avatar into a portrait image (engine chunk loads on demand). */
export function AvatarPortrait({
  avatar,
  size = 96,
  framing = 'head',
  className = '',
}: {
  avatar: AvatarConfig | undefined;
  size?: number;
  framing?: 'head' | 'full';
  className?: string;
}) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    if (!avatar) return;
    let alive = true;
    void import('../../engine/portrait').then(({ renderAvatarPortrait }) => {
      if (alive) setSrc(renderAvatarPortrait(avatar, size * 2, framing));
    });
    return () => {
      alive = false;
    };
  }, [avatar, size, framing]);
  return (
    <span className={`avatar-portrait ${className}`} style={{ width: size, height: size }}>
      {src ? <img src={src} width={size} height={size} alt="" /> : null}
    </span>
  );
}
