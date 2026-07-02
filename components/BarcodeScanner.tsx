import React, { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, ScanLine } from 'lucide-react';

// Generic camera barcode scanner (native BarcodeDetector, no dependency) — the same
// proven pattern as VinScanner, but returns the raw code for product barcodes (UPC/EAN).
// Degrades gracefully: no camera / unsupported browser → explain and let them type.
export const BarcodeScanner: React.FC<{
  hint?: string;
  onResult: (code: string) => void;
  onClose: () => void;
}> = ({ hint = 'Point at the product barcode', onResult, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'init' | 'scanning' | 'unsupported' | 'nocam'>('init');

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      } catch {
        setStatus('nocam');
        return;
      }
      if (!supported) { setStatus('unsupported'); return; }
      setStatus('scanning');
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
      const tick = async () => {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const first = codes.find((c: any) => (c.rawValue || '').trim());
          if (first) { stopped = true; onResult(String(first.rawValue).trim()); return; }
        } catch { /* frame not ready */ }
        timer = setTimeout(tick, 350);
      };
      tick();
    })();

    return () => { stopped = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[800] bg-black flex flex-col items-center justify-center">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="w-72 h-32 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        <p className="mt-5 text-sm font-semibold text-white bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <ScanLine size={15} /> {hint}
        </p>
      </div>
      {(status === 'unsupported' || status === 'nocam') && (
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 bg-slate-900 border border-amber-500/30 rounded-2xl p-4 text-center pointer-events-auto">
          <AlertTriangle size={22} className="mx-auto text-amber-400 mb-2" />
          <p className="text-sm text-amber-200">
            {status === 'nocam'
              ? 'No camera access — close and search by name instead.'
              : 'Barcode scanning isn’t supported in this browser — use Chrome on your phone, or search by name.'}
          </p>
        </div>
      )}
      <button onClick={onClose} className="absolute top-6 right-6 p-3 bg-white/10 backdrop-blur rounded-full text-white pointer-events-auto active:scale-95"><X size={24} /></button>
    </div>
  );
};
