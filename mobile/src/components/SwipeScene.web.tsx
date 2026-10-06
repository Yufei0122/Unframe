import React, { useEffect, useRef } from 'react';
import type { SwipeSceneProps } from './SwipeScene';

export function SwipeScene({ children, onSwipe, onDrag, onHold, onVisibility }: SwipeSceneProps) {
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const visibility = useRef(onVisibility); visibility.current = onVisibility;
  useEffect(() => {
    let intersecting = true;
    const update = () => visibility.current(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; update(); }, { threshold: .1 });
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', update); update();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const finish = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const point = start.current; if (!point || point.id !== event.pointerId) return;
    const dx = event.clientX - point.x, dy = event.clientY - point.y;
    start.current = null; onDrag?.(0); onHold(false);
    if (!cancelled && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) onSwipe(dx < 0 ? 1 : -1);
  };
  return <div ref={root} style={{ touchAction: 'pan-y', userSelect: 'none', overflow: 'hidden' }}
    onFocusCapture={event => { if (event.target.matches(':focus-visible')) onHold(true); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHold(false); }}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button,a,[role="button"]')) return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; onHold(true); event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { const point = start.current; if (point && point.id === event.pointerId) { const dx = event.clientX - point.x, dy = event.clientY - point.y; if (Math.abs(dx) > Math.abs(dy)) onDrag?.(Math.max(-180, Math.min(180, dx))); } }}
    onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
    {children}
  </div>;
}
