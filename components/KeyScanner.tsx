import React, { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Camera, RotateCcw, Loader2 } from 'lucide-react';
import { overlayGeometry, scanPrompt } from '../keyCalibration';
import { readKeyImage } from '../keyScanAI';
import type { MasterKeyBrand } from '../masterKeyUtils';

// Camera reader for a key's bitting. The whole trick is the overlay: the operator
// lines the cuts up under the printed ticks, which fixes the scale, and the depth
// ruler beside them then reads true. The same overlay is burned into the frame we
// send off, so the model reads a ruler instead of estimating a size.

interface Props {
  brand: MasterKeyBrand;
  chambers: number;
  brandName: string;
  onResult: (depths: number[], unsure: number[]) => void;
  onClose: () => void;
}

type Phase = 'live' | 'nocam' | 'reading' | 'failed';

/** Draws ticks and the depth ruler at natural size for the given canvas/frame. */
const paintOverlay = (
  ctx: CanvasRenderingContext2D,
  brand: MasterKeyBrand,
  chambers: number,
  w: number,
  h: number,
  scale = 1,
) => {
  const g = overlayGeometry(brand, w, h, chambers);
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.font = `${Math.round(13 * scale)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  for (const { depth, y } of g.depthLines) {
    ctx.strokeStyle = 'rgba(96,165,250,0.55)';
    ctx.beginPath();
    ctx.moveTo(g.shoulderX * 0.35, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(147,197,253,0.95)';
    ctx.fillText(String(depth), 4 * scale, y);
  }

  ctx.strokeStyle = 'rgba(251,191,36,0.95)';
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.moveTo(g.shoulderX * 0.35, g.baselineY);
  ctx.lineTo(w, g.baselineY);
  ctx.stroke();

  // Ticks must clear the SHALLOWEST line — that is the highest one on screen, and
  // depthLines is ordered by depth number, so the shallowest sits at index 0.
  const topLineY = Math.min(...g.depthLines.map(l => l.y));

  g.cutXs.forEach((x, i) => {
    ctx.strokeStyle = 'rgba(251,191,36,0.95)';
    ctx.beginPath();
    ctx.moveTo(x, g.baselineY);
    ctx.lineTo(x, topLineY - 10 * scale);
    ctx.stroke();
    ctx.fillStyle = 'rgba(253,224,71,1)';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x, g.baselineY + 14 * scale);
    ctx.textAlign = 'left';
  });
};

export const KeyScanner: React.FC<Props> = ({ brand, chambers, brandName, onResult, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('live');
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      } catch {
        setPhase('nocam');
      }
    })();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);

  // Keep the on-screen guide sized to the live video box.
  useEffect(() => {
    const draw = () => {
      const c = overlayRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      if (!rect.width) return;
      c.width = rect.width;
      c.height = rect.height;
      const ctx = c.getContext('2d');
      if (ctx) paintOverlay(ctx, brand, chambers, c.width, c.height);
    };
    draw();
    window.addEventListener('resize', draw);
    const t = setInterval(draw, 500);
    return () => { window.removeEventListener('resize', draw); clearInterval(t); };
  }, [brand, chambers]);

  const shoot = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setPhase('reading');
    setError('');

    // Burn the same overlay into the captured frame so the model reads our ruler.
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setPhase('failed'); setError('Не удалось получить кадр.'); return; }
    ctx.drawImage(v, 0, 0);
    paintOverlay(ctx, brand, chambers, canvas.width, canvas.height, canvas.width / 400);

    try {
      const data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      const r = await readKeyImage({ data, mimeType: 'image/jpeg' }, scanPrompt(brand, chambers), chambers);
      if (!r.depths.length) {
        setPhase('failed');
        setError('Не разглядел вырезы. Приложи ключ ровно под метки и попробуй ещё раз.');
        return;
      }
      onResult(r.depths, r.unsure);
    } catch (e: any) {
      setPhase('failed');
      setError(e?.message || 'AI недоступен.');
    }
  };

  return (
    <div className="fixed inset-0 z-[800] bg-black flex flex-col">
      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={overlayRef} className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-44 pointer-events-none" />

        {phase === 'nocam' && (
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 bg-slate-900 border border-amber-500/30 rounded-2xl p-4 text-center">
            <AlertTriangle size={22} className="mx-auto text-amber-400 mb-2" />
            <p className="text-sm text-amber-200">Нет доступа к камере — введи нарезку вручную.</p>
          </div>
        )}

        <button onClick={onClose} className="absolute top-5 right-5 p-3 bg-white/10 backdrop-blur rounded-full text-white active:scale-95">
          <X size={22} />
        </button>
      </div>

      <div className="bg-slate-900 border-t border-white/10 p-4 pb-7" style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}>
        <p className="text-[13px] text-slate-300 text-center mb-1">
          Положи ключ на <b>тёмную ровную поверхность</b> бородкой влево
        </p>
        <p className="text-[12px] text-slate-500 text-center mb-4">
          Двигай телефон, пока вырезы не встанут точно под жёлтые метки 1–{chambers}. Нижняя грань ключа — на жёлтой линии. {brandName}.
        </p>

        {error && (
          <p className="text-[12.5px] text-amber-400 text-center mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          {phase === 'failed' && (
            <button onClick={() => { setPhase('live'); setError(''); }} className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-2">
              <RotateCcw size={16} /> Ещё раз
            </button>
          )}
          <button
            onClick={shoot}
            disabled={phase === 'reading' || phase === 'nocam'}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {phase === 'reading'
              ? <><Loader2 size={17} className="animate-spin" /> Читаю…</>
              : <><Camera size={17} /> Снять и прочитать</>}
          </button>
        </div>

        <p className="text-[11px] text-slate-600 text-center mt-3">
          Результат — черновик. Каждую цифру сверь калибром.
        </p>
      </div>
    </div>
  );
};
