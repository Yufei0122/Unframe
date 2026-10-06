import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export function CameraCapture({ onCapture, children }: { onCapture: (blob: Blob) => void; children: (camera: { ready: boolean; error: string; capture: () => void }) => React.ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const alive = useRef(false), capturing = useRef(false);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, stream: MediaStream | undefined;
    alive.current = true;
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Camera requires HTTPS or localhost and a supported browser. You can upload a photo instead.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); if (!disposed) setReady(true); }
      } catch (error) {
        if (disposed) return;
        stream?.getTracks().forEach(track => track.stop());
        const denied = error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
        setError(denied ? 'Camera access was not granted. Allow it in browser site settings, or upload a photo.' : 'No available camera was found. Close other camera apps or upload a photo.');
      }
    }
    void open();
    return () => { disposed = true; alive.current = false; stream?.getTracks().forEach(track => track.stop()); };
  }, []);
  function capture() {
    const source = video.current;
    if (!source?.videoWidth || capturing.current) return;
    capturing.current = true;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1536 / Math.max(source.videoWidth, source.videoHeight));
    canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        capturing.current = false;
        if (!alive.current) return;
        if (blob) onCapture(blob); else setError('Could not capture this frame. Please try again.');
      }, 'image/jpeg', .85);
    } catch { capturing.current = false; setError('Could not capture this frame. Please try again.'); }
  }
  return <View style={StyleSheet.absoluteFill}>
    <video ref={video} aria-label="Live camera preview" muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#101915' }}/>
    {children({ ready, error, capture })}
  </View>;
}
