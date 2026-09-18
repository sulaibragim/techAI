import { LostCall, LostReason } from './types';

// The reasons a manager picks from when a call ends without a job (training/02, part 7).
export const LOST_REASONS: { id: LostReason; emoji: string; label: string }[] = [
  { id: 'price',    emoji: '💲', label: 'Цена' },
  { id: 'wait',     emoji: '⏱', label: 'Долго ждать' },
  { id: 'shopping', emoji: '🔍', label: 'Просто узнавал цену' },
  { id: 'self',     emoji: '🚪', label: 'Открыл сам' },
  { id: 'area',     emoji: '🗺', label: 'Вне зоны' },
  { id: 'notOurs',  emoji: '🚫', label: 'Не наша услуга' },
  { id: 'dealer',   emoji: '🚗', label: 'Дилерская машина' },
  { id: 'noId',     emoji: '🪪', label: 'Нет документов' },
  { id: 'other',    emoji: '✏️', label: 'Другое' },
];

export const LOST_REASON = Object.fromEntries(LOST_REASONS.map(r => [r.id, r])) as Record<LostReason, typeof LOST_REASONS[number]>;

/** Marked inside [from, to), newest first. */
export function lostBetween(list: LostCall[], from: Date, to: Date): LostCall[] {
  const a = from.getTime(), b = to.getTime();
  return list
    .filter(l => { const t = Date.parse(l.timestamp); return t >= a && t < b; })
    .sort((x, y) => y.timestamp.localeCompare(x.timestamp));
}

/** Marked in the last `days` days. */
export const lostInLastDays = (list: LostCall[], days: number, now = new Date()): LostCall[] =>
  lostBetween(list, new Date(now.getTime() - days * 86_400_000), new Date(now.getTime() + 60_000));

/** Marked in the given reporting months (local time), newest first. */
export function lostInMonths(list: LostCall[], span: { year: number; month: number }[]): LostCall[] {
  const keys = new Set(span.map(m => `${m.year}-${m.month}`));
  return list
    .filter(l => { const d = new Date(l.timestamp); return keys.has(`${d.getFullYear()}-${d.getMonth()}`); })
    .sort((x, y) => y.timestamp.localeCompare(x.timestamp));
}

/** "1 звонок", "3 звонка", "12 звонков". */
export function callsRu(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'звонок' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'звонка' : 'звонков';
  return `${n} ${word}`;
}

/** How often each reason came up, most frequent first; reasons that never did are left out. */
export function countByReason(list: LostCall[]): { reason: LostReason; count: number }[] {
  const counts = new Map<LostReason, number>();
  for (const l of list) counts.set(l.reason, (counts.get(l.reason) || 0) + 1);
  return LOST_REASONS
    .map(r => ({ reason: r.id, count: counts.get(r.id) || 0 }))
    .filter(r => r.count > 0)
    .sort((x, y) => y.count - x.count);
}
