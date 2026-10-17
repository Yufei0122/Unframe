import React, { useRef } from 'react';

export function ArtworkRail({ children }: { children: React.ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; id: number; active: boolean } | null>(null);
  return <div ref={rail} role="list" aria-label="Nearby artworks" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 18px 5px', scrollbarWidth: 'none', cursor: 'grab', touchAction: 'pan-x pan-y', userSelect: 'none' }}
    onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, id: event.pointerId, active: false }; }}
    onPointerMove={event => { const point = drag.current; if (point?.id !== event.pointerId) return; const dx = event.clientX - point.x; if (!point.active && Math.abs(dx) > 6) { point.active = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.style.cursor = 'grabbing'; } if (point.active) event.currentTarget.scrollLeft = point.left - dx; }}
    onPointerUp={event => { drag.current = null; event.currentTarget.style.cursor = 'grab'; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={event => { drag.current = null; event.currentTarget.style.cursor = 'grab'; }}>
    {children}
  </div>;
}
