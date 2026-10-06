import React, { useEffect, useRef } from 'react';
import { Asset } from 'expo-asset';
import type { PreviewBackdropProps } from './PreviewBackdrop';
import './preview-backdrop.css';

function photoUrl(source: PreviewBackdropProps['image']) { return Asset.fromModule(source as number).uri; }

export function PreviewBackdrop({ id, image, cityImages, adjacentImage, drag, direction, reducedMotion }: PreviewBackdropProps) {
  const prior = useRef<{ id: string; url: string } | null>(null);
  const current = useRef({ id, url: photoUrl(image) });
  const sequence = useRef(0);
  const changedAt = useRef(0);
  useEffect(() => {
    const warm = cityImages.map(source => { const img = new window.Image(); img.src = photoUrl(source); return img; });
    return () => { warm.forEach(img => { img.src = ''; }); };
  }, [cityImages]);
  if (current.current.id !== id) {
    prior.current = current.current;
    current.current = { id, url: photoUrl(image) };
    sequence.current += 1;
    changedAt.current = performance.now();
  }
  const animate = sequence.current > 0 && performance.now() - changedAt.current < 850 && !reducedMotion;
  const sliding = drag !== 0 && !reducedMotion;
  const variables = { '--scene-enter': direction > 0 ? '11%' : '-11%', '--scene-exit': direction > 0 ? '-10%' : '10%' } as React.CSSProperties;
  return <div className="preview-backdrop" style={variables} data-testid="scene-media" aria-hidden="true">
    {sliding && adjacentImage && <img className="preview-adjacent" src={photoUrl(adjacentImage)} alt=""/>}
    {animate && prior.current && !sliding && <img key={'old-' + sequence.current} className="preview-outgoing" src={prior.current.url} alt=""/>}
    <div key={'frame-' + sequence.current} className={animate && !sliding ? 'preview-incoming' : 'preview-still'} style={sliding ? { transform: `translate3d(${drag * .9}px,0,0) scale(1.04)`, transition: 'none' } : undefined}>
      <img className="preview-photo" src={current.current.url} alt=""/>
    </div>
  </div>;
}
