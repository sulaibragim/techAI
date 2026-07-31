import React, { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Camera, RotateCcw, Loader2, Check } from 'lucide-react';
import { overlayGeometry, scanPrompt } from '../keyCalibration';
import { readKeyImage } from '../keyScanAI';
import type { MasterKeyBrand } from '../masterKeyUtils';

// Camera reader for a key's bitting. The trick is the overlay: the operator lines the
// cuts up under the printed ticks, which fixes the scale, and the depth ruler beside
// them then reads true.
//
// The captured frame is cropped to EXACTLY the band the operator aligned against —
// the video is object-cover, so the on-screen guide and the raw video pixels do not
// share a coordinate system. Burning the overlay onto the full frame would hand the
// model a ruler sitting somewhere the key never was.

interface Props {
  brand: MasterKeyBrand;
  chambers: number;
  brandName: string;
  onResult: (depths: number[], unsure: number[]) => void;
  onClose: () => void;
}

type Phase = 'live' | 'preview' | 'reading' | 'failed' | 'nocam';

const paintOverlay = (
  ctx: CanvasRenderingContext2D,
  brand: MasterKeyBrand,
  chambers: number,
  w: number,
  h: number,
  scale = 1,
) => {
  const g = overlayGeometry(brand, w, h, chambers);
  const arm = 9 * scale;
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.font = `${Math.round(13 * scale)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  // Ghost blade first, so the ruler and ticks read on top of it.
  const bowR = (g.baselineY - g.bladeTopY) * 0.85;
  ctx.beginPath();
  ctx.moveTo(g.shoulderX, g.bladeTopY);
  ctx.lineTo(g.tipX - 10 * scale, g.bladeTopY);
  ctx.lineTo(g.tipX, g.bladeTopY + 9 * scale);
  ctx.lineTo(g.tipX, g.baselineY);
  ctx.lineTo(g.shoulderX, g.baselineY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.setLineDash([6 * scale, 5 * scale]);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(g.shoulderX - bowR * 0.5, (g.bladeTopY + g.baselineY) / 2, bowR, -Math.PI / 2.1, Math.PI / 2.1);
  ctx.stroke();
  ctx.setLineDash([]);

  // Shoulder stop — the true datum: every cut position is measured from here.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.5, 2.2 * scale);
  ctx.beginPath();
  ctx.moveTo(g.shoulderX, g.bladeTopY);
  ctx.lineTo(g.shoulderX, g.baselineY);
  ctx.moveTo(g.shoulderX, g.bladeTopY);
  ctx.lineTo(g.shoulderX - arm, g.bladeTopY);
  ctx.moveTo(g.shoulderX, g.baselineY);
  ctx.lineTo(g.shoulderX - arm, g.baselineY);
  ctx.stroke();

  // Tip stop — helpful for squaring the key up, but blade length is not published,
  // so it is drawn softer than the shoulder to signal "about here", not "exactly".
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, 1.6 * scale);
  ctx.setLineDash([5 * scale, 4 * scale]);
  ctx.beginPath();
  ctx.moveTo(g.tipX, g.bladeTopY);
  ctx.lineTo(g.tipX, g.baselineY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(g.tipX, g.bladeTopY);
  ctx.lineTo(g.tipX + arm, g.bladeTopY);
  ctx.moveTo(g.tipX, g.baselineY);
  ctx.lineTo(g.tipX + arm, g.baselineY);
  ctx.stroke();

  ctx.lineWidth = Math.max(1, 1.5 * scale);
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
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('live');
  const [photo, setPhoto] = useState<string | null>(null);
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
  }, [brand, chambers, phase]);

  /** Crop the video to the band the operator actually aligned against. */
  const capture = () => {
    const v = videoRef.current, stage = stageRef.current, guide = overlayRef.current;
    if (!v || !stage || !guide || !v.videoWidth) return;

    const stageBox = stage.getBoundingClientRect();
    const guideBox = guide.getBoundingClientRect();

    // object-cover: the video is scaled to fill the stage, overflow cropped evenly.
    const cover = Math.max(stageBox.width / v.videoWidth, stageBox.height / v.videoHeight);
    const shownW = v.videoWidth * cover, shownH = v.videoHeight * cover;
    const offX = (stageBox.width - shownW) / 2, offY = (stageBox.height - shownH) / 2;

    const toVideo = (px: number, py: number) => ({ x: (px - offX) / cover, y: (py - offY) / cover });
    const a = toVideo(guideBox.left - stageBox.left, guideBox.top - stageBox.top);
    const b = toVideo(guideBox.right - stageBox.left, guideBox.bottom - stageBox.top);

    const sx = Math.max(0, a.x), sy = Math.max(0, a.y);
    const sw = Math.min(v.videoWidth - sx, b.x - a.x), sh = Math.min(v.videoHeight - sy, b.y - a.y);
    if (sw <= 0 || sh <= 0) { setError('Не удалось поймать кадр.'); setPhase('failed'); return; }

    const out = document.createElement('canvas');
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const ctx = out.getContext('2d');
    if (!ctx) { setError('Не удалось поймать кадр.'); setPhase('failed'); return; }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, out.width, out.height);
    // Same proportions as the on-screen guide, so the ruler lands where the key is.
    paintOverlay(ctx, brand, chambers, out.width, out.height, out.width / guideBox.width);

    setPhoto(out.toDataURL('image/jpeg', 0.92));
    setPhase('preview');
    setError('');
  };

  const read = async () => {
    if (!photo) return;
    setPhase('reading');
    setError('');
    try {
      const r = await readKeyImage({ data: photo.split(',')[1], mimeType: 'image/jpeg' }, scanPrompt(brand, chambers), chambers);
      if (!r.depths.length) {
        setPhase('failed');
        setError('Не разглядел вырезы. Переснимай — ключ должен точно сесть под метки.');
        return;
      }
      onResult(r.depths, r.unsure);
    } catch (e: any) {
      setPhase('failed');
      setError(e?.message || 'AI недоступен.');
    }
  };

  const retake = () => { setPhoto(null); setPhase('live'); setError(''); };
  const frozen = phase === 'preview' || phase === 'reading' || (phase === 'failed' && !!photo);

  return (
    <div className="fixed inset-0 z-[800] bg-black flex flex-col">
      <div ref={stageRef} className="relative flex-1 min-h-0">
        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${frozen ? 'invisible' : ''}`} />

        {frozen && photo && (
          <img src={photo} alt="Снятый кадр ключа" className="absolute inset-0 w-full h-full object-contain bg-black" />
        )}

        <canvas
          ref={overlayRef}
          className={`absolute inset-x-4 top-1/2 -translate-y-1/2 h-44 pointer-events-none ${frozen ? 'hidden' : ''}`}
        />

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

      <div className="bg-slate-900 border-t border-white/10 p-4" style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}>
        {!frozen ? (
          <>
            <p className="text-[13px] text-slate-300 text-center mb-1">
              Ключ на <b>тёмную ровную поверхность</b> бородкой влево
            </p>
            <p className="text-[12px] text-slate-500 text-center mb-4">
              Плечо — на белый упор, кончик — к пунктирному, вырезы под метки 1–{chambers}, нижняя грань на жёлтой линии. {brandName}.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-slate-300 text-center mb-4">
            {phase === 'reading'
              ? 'Читаю снимок…'
              : 'Вырезы сели под метки? Тогда читаем. Смазало или мимо — переснимай.'}
          </p>
        )}

        {error && <p className="text-[12.5px] text-amber-400 text-center mb-3">{error}</p>}

        <div className="flex gap-2">
          {frozen && phase !== 'reading' && (
            <button onClick={retake} className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-2 active:scale-95 transition">
              <RotateCcw size={16} /> Переснять
            </button>
          )}

          {!frozen ? (
            <button
              onClick={capture}
              disabled={phase === 'nocam'}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <Camera size={17} /> Снять
            </button>
          ) : (
            <button
              onClick={read}
              disabled={phase === 'reading'}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition"
            >
              {phase === 'reading'
                ? <><Loader2 size={17} className="animate-spin" /> Читаю…</>
                : <><Check size={17} /> Прочитать</>}
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-600 text-center mt-3">
          Результат — черновик. Каждую цифру сверь калибром.
        </p>
      </div>
    </div>
  );
};
