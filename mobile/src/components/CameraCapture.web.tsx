import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

// Sample only after the previous recognition request finishes. Unmounting releases the camera.
export function CameraCapture({ onFrame, onUnavailable, children }: {
  onFrame: (blob: Blob) => Promise<void>;
  onUnavailable: () => void;
  children: (camera: { ready: boolean; error: string }) => React.ReactNode;
}) {
  const video = useRef<HTMLVideoElement>(null), onFrameRef = useRef(onFrame), unavailableRef = useRef(onUnavailable);
  onFrameRef.current = onFrame; unavailableRef.current = onUnavailable;
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, failed = false, stream: MediaStream | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const source = video.current;
    function fail(message: string) {
      if (disposed || failed) return;
      failed = true;
      setReady(false); setError(message); clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      unavailableRef.current();
    }
    async function sample() {
      if (disposed || failed || !source || document.visibilityState === 'hidden') return;
      if (!source.videoWidth || source.readyState < 2) { timer = setTimeout(() => { void sample(); }, 350); return; }
      try {
        const canvas = document.createElement('canvas');
        // Match the visible cover preview, including its portrait crop.
        const ratio = source.clientWidth / source.clientHeight || source.videoWidth / source.videoHeight;
        const width = Math.min(source.videoWidth, source.videoHeight * ratio), height = width / ratio;
        const scale = Math.min(1, 960 / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(source, (source.videoWidth - width) / 2, (source.videoHeight - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .78));
        if (disposed || failed) return;
        if (!blob) throw new Error('Frame unavailable');
        await onFrameRef.current(blob);
        if (!disposed && !failed) timer = setTimeout(() => { void sample(); }, 3000);
      } catch { fail('Could not read the camera preview. Try the camera again or upload a photo.'); }
    }
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) { fail('Camera requires HTTPS or localhost and a supported browser. You can upload a photo instead.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        stream.getTracks().forEach(track => track.addEventListener?.('ended', () => fail('The camera stopped. Try the camera again or upload a photo.')));
        if (source) {
          source.srcObject = stream; await source.play();
          if (!disposed && !failed) { setReady(true); timer = setTimeout(() => { void sample(); }, 350); }
        }
      } catch (error) {
        if (disposed) return;
        const denied = error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
        fail(denied ? 'Camera access was not granted. Allow it in browser site settings, or upload a photo.' : 'No available camera was found. Close other camera apps or upload a photo.');
      }
    }
    void open();
    return () => {
      disposed = true; clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (source) source.srcObject = null;
    };
  }, []);
  return <View style={StyleSheet.absoluteFill}>
    <video ref={video} aria-label="Live camera preview" muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#101915' }}/>
    {children({ ready, error })}
  </View>;
}
