import React, { useState } from 'react';
import type { PinningPosition } from '../masterKeyUtils';

// Cut-away of the plug, one column per chamber. Toggling the key slides every stack
// so the break that lands on the shear line changes — which is the whole point of
// master keying and the one thing a table of numbers cannot show.

interface Props {
  positions: PinningPosition[];
  maxDepth: number;
}

const UNIT = 13;      // px per depth step
const SHEAR = 128;    // px from the top of the box to the shear line
const BOX = 300;

export const CylinderDiagram: React.FC<Props> = ({ positions, maxDepth }) => {
  const [showMaster, setShowMaster] = useState(true);

  // A real cylinder has a constant stack height; the driver pin takes up the slack
  // so that bottom + wafer + driver is the same in every chamber.
  const total = maxDepth + 2;

  return (
    <div>
      <div className="flex rounded-xl overflow-hidden border border-white/10 mb-3">
        {([true, false] as const).map(isMaster => (
          <button
            key={String(isMaster)}
            onClick={() => setShowMaster(isMaster)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              showMaster === isMaster
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isMaster ? 'Мастер-ключ' : 'Ключ двери'}
          </button>
        ))}
      </div>

      <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-white/10" style={{ height: BOX }}>
        <div className="absolute inset-x-0 top-0 bg-slate-800/70" style={{ height: SHEAR }} />
        <div className="absolute inset-x-0 bottom-0 bg-slate-900" style={{ top: SHEAR }} />

        <div className="absolute inset-x-0 border-t border-dashed border-slate-500 z-10" style={{ top: SHEAR }} />
        <span className="absolute left-2 text-[9px] text-slate-500 z-20" style={{ top: SHEAR + 4 }}>линия среза</span>
        <span className="absolute right-2 top-1.5 text-[9px] text-slate-500 z-20">корпус</span>
        <span className="absolute right-2 text-[9px] text-slate-500 z-20" style={{ top: SHEAR + 4 }}>плаг</span>

        <div className="absolute inset-0 flex justify-center gap-3 z-[5]">
          {positions.map(p => {
            const cut = showMaster ? p.master : p.change;
            const wafer = p.masterWafer;
            const driver = Math.max(1, total - Math.max(p.master, p.change));

            const surface = SHEAR + cut * UNIT;
            const bottomTop = surface - p.bottomPin * UNIT;
            const waferTop = bottomTop - wafer * UNIT;
            const driverTop = waferTop - driver * UNIT;

            const pin = 'absolute left-[3px] right-[3px] rounded-[3px] transition-[top] duration-500 ease-out';

            return (
              <div key={p.position} className="relative w-[34px]">
                <div className={`${pin} bg-slate-600 border border-slate-500`} style={{ top: driverTop, height: driver * UNIT }} />
                {wafer > 0 && (
                  <div className={`${pin} bg-blue-500 border border-blue-400`} style={{ top: waferTop, height: wafer * UNIT }} />
                )}
                <div className={`${pin} bg-slate-400 border border-slate-300`} style={{ top: bottomTop, height: p.bottomPin * UNIT }} />
                <div
                  className="absolute left-[9px] right-[9px] bottom-0 bg-slate-700/50 transition-[top] duration-500 ease-out"
                  style={{ top: surface }}
                />
                <div className="absolute -inset-x-px h-1 rounded-sm bg-blue-400 z-[7]" style={{ top: SHEAR - 2 }} />
                <span className="absolute bottom-1 inset-x-0 text-center text-[10px] text-slate-500 z-[8]">{p.position}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-slate-600 inline-block" />верхний штифт</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />мастер-шайба</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />нижний штифт</span>
      </div>
    </div>
  );
};
