import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map.js';
import MapView from 'ol/View.js';
import Overlay from 'ol/Overlay.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { fromLonLat } from 'ol/proj.js';
import { boundingExtent } from 'ol/extent.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import type { DiscoveryMapProps } from './DiscoveryMap';
import 'ol/ol.css';
import './discovery-map.css';

export function DiscoveryMap({ places, selectedId, coordinates, onSelect, height, active }: DiscoveryMapProps) {
  const target = useRef<HTMLDivElement>(null), mapRef = useRef<Map | null>(null);
  const select = useRef(onSelect); select.current = onSelect;
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const city = places[0].city;
  useEffect(() => {
    if (!target.current || !active) return;
    setFailed(false);
    const source = new OSM({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 });
    const tileError = () => setFailed(true);
    source.on('tileloaderror', tileError);
    const view = new MapView({ maxZoom: 19, minZoom: 3 });
    const map = new Map({ target: target.current, layers: [new TileLayer({ source })], view,
      controls: defaultControls({ rotate: false, attributionOptions: { collapsible: false } }),
      interactions: defaultInteractions({ mouseWheelZoom: false }),
    });
    mapRef.current = map;
    places.forEach(place => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'museum-pin'; button.dataset.museum = place.id;
      button.setAttribute('aria-label', 'Preview ' + place.shortName + ' on map');
      button.innerHTML = '<span aria-hidden="true" class="museum-pin-icon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8 12 3l9 5ZM3 21h18M5 18h14M6 9v9m6-9v9m6-9v9"/></svg></span>';
      const label = document.createElement('span'); label.className = 'museum-pin-label'; label.textContent = place.shortName;
      button.append(label); button.onclick = () => select.current(place.id);
      // These adjacent buildings overlap at city zoom; short leader lines keep
      // both targets tappable while retaining their geographic anchor.
      const shift = ['qag', 'met'].includes(place.id) ? 'left' : ['kurilpa', 'guggenheim'].includes(place.id) ? 'right' : '';
      button.dataset.shift = shift;
      const offset = shift === 'left' ? [-22, 0] : shift === 'right' ? [22, 0] : [0, 0];
      map.addOverlay(new Overlay({ element: button, position: fromLonLat([place.longitude, place.latitude]), offset, positioning: 'bottom-center', stopEvent: true }));
    });
    const fit = () => { map.updateSize(); view.fit(boundingExtent(places.map(place => fromLonLat([place.longitude, place.latitude]))), { padding: [160, 68, 62, 68], maxZoom: 16, duration: 0 }); };
    const observer = new ResizeObserver(fit); observer.observe(target.current); fit();
    return () => { observer.disconnect(); source.un('tileloaderror', tileError); map.setTarget(undefined); map.dispose(); mapRef.current = null; };
  }, [city, active, revision]);
  useEffect(() => {
    target.current?.querySelectorAll<HTMLButtonElement>('.museum-pin').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.museum === selectedId));
      const wrapper = button.parentElement; if (wrapper) wrapper.style.zIndex = button.dataset.museum === selectedId ? '5' : '1';
    });
  }, [selectedId, city, active, revision]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !coordinates) return;
    const dot = document.createElement('div'); dot.className = 'museum-gps'; dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', 'Your device location');
    dot.title = coordinates.accuracy == null ? 'Device location' : 'Device location · accuracy ' + Math.round(coordinates.accuracy) + ' m';
    const overlay = new Overlay({ element: dot, position: fromLonLat([coordinates.longitude, coordinates.latitude]), positioning: 'center-center', stopEvent: false });
    map.addOverlay(overlay);
    return () => { map.removeOverlay(overlay); };
  }, [coordinates, city, active, revision]);
  return <div className="discovery-map-wrap" style={{ height }}>
    <div ref={target} className="discovery-map" data-testid="openlayers-map" role="region" aria-label={city === 'new-york' ? 'New York museum map' : 'Brisbane museum map'} tabIndex={0}/>
    {failed && <div className="map-error" role="status">Map tiles unavailable. Museum pins still work. <button onClick={() => setRevision(value => value + 1)}>Retry map</button></div>}
  </div>;
}
