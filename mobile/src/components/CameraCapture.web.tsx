import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Notice, T, s } from '../ui';

export function CameraCapture({ onCapture, onClose }: { onCapture: (blob: Blob) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, stream: MediaStream | undefined;
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
    return () => { disposed = true; stream?.getTracks().forEach(track => track.stop()); };
  }, []);
  function capture() {
    const source = video.current;
    if (!source?.videoWidth) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1536 / Math.max(source.videoWidth, source.videoHeight));
    canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => { if (blob) onCapture(blob); else setError('Could not capture this frame. Please try again.'); }, 'image/jpeg', .85);
  }
  return <View style={{ gap: 12 }}>
    <video ref={video} aria-label="Live camera preview" muted playsInline style={{ width: '100%', maxHeight: 260, borderRadius: 16, background: '#192722' }}/>
    {!ready && !error && <T style={s.muted}>Waiting for camera permission…</T>}
    {!!error && <Notice>{error}</Notice>}
    <Button title="Capture photo" disabled={!ready} icon="camera" onPress={capture}/>
    <Button title="Close camera" secondary onPress={onClose}/>
  </View>;
}
