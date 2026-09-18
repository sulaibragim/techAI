// Scoring a recorded call (training/research/01, "Draft scorecard"). Each point is 0 (missed),
// 1 (partly) or 2 (done well); null = didn't apply (only the safety check can). A call passes
// at 85% with no critical point missed — a wrong price or a made-up promise fails it outright.

export type Score = 0 | 1 | 2 | null;

export interface ScoreItem {
  id: string;
  label: string;
  hint: string;
  critical?: boolean;
  optional?: boolean; // may be marked "didn't apply"
}

export const SCORECARD: ScoreItem[] = [
  { id: 'greeting', label: 'Приветствие', hint: 'Взял трубку быстро; название компании и своё имя' },
  { id: 'safety', label: 'Безопасность', hint: 'Спросил, нет ли внутри человека или животного', critical: true, optional: true },
  { id: 'where', label: 'Город, имя, номер', hint: 'В начале звонка, дальше — по имени' },
  { id: 'discovery', label: 'Нужные вопросы', hint: '2–4 вопроса по делу, без допроса' },
  { id: 'price', label: 'Цена', hint: 'Точная и полная, одной фразой, что входит; ночь — сказал', critical: true },
  { id: 'eta', label: 'Время приезда', hint: 'Окно из CRM, не наугад; холд — с разрешения' },
  { id: 'ask', label: 'Попросил записаться', hint: '«What\'s the exact address?» или выбор времени', critical: true },
  { id: 'tone', label: 'Тон', hint: 'Одна фраза сочувствия, спокойный темп, улыбка в голосе' },
  { id: 'control', label: 'Вёл разговор', hint: 'Ответил на возражение и вернул к записи' },
  { id: 'readback', label: 'Повтор', hint: 'Имя, адрес, услуга, цена, время; СМС с техником' },
  { id: 'honesty', label: 'Честность', hint: 'Ничего не выдумал и не пообещал лишнего', critical: true },
  { id: 'close', label: 'Прощание', hint: 'Тепло: спасибо, имя, что дальше; не записался — причина в CRM' },
];

export const PASS_PCT = 85;

export interface CallScore {
  points: number;
  max: number;
  pct: number;
  criticalMisses: string[]; // labels of critical points scored 0
  passed: boolean;
}

export function scoreCall(scores: Score[]): CallScore {
  let points = 0, max = 0;
  const criticalMisses: string[] = [];
  SCORECARD.forEach((item, i) => {
    const s = scores[i];
    if (s == null) return;
    points += s;
    max += 2;
    if (item.critical && s === 0) criticalMisses.push(item.label);
  });
  const pct = max ? Math.round((points / max) * 100) : 0;
  return { points, max, pct, criticalMisses, passed: pct >= PASS_PCT && criticalMisses.length === 0 };
}

/** Every point scored — or, for the one that may not apply, marked so. */
export const reviewComplete = (scores: (Score | undefined)[]): boolean =>
  SCORECARD.every((item, i) => scores[i] !== undefined && (scores[i] !== null || !!item.optional));

type Reviewed = { managerId: string; scores: Score[] };

/** Someone's last few reviews (newest first): how many in all, their average, and the point to coach next. */
export function deskTrend(reviews: Reviewed[], managerId: string, n = 5): { count: number; avg: number | null; weakest: string | null } {
  const mine = reviews.filter(r => r.managerId === managerId);
  const recent = mine.slice(0, n);
  if (!recent.length) return { count: 0, avg: null, weakest: null };
  const avg = Math.round(recent.reduce((sum, r) => sum + scoreCall(r.scores).pct, 0) / recent.length);
  let weakest: string | null = null;
  let low = 2;
  SCORECARD.forEach((item, i) => {
    const got = recent.map(r => r.scores[i]).filter((s): s is 0 | 1 | 2 => s != null);
    if (!got.length) return;
    const mean = got.reduce<number>((sum, s) => sum + s, 0) / got.length;
    if (mean < low) { low = mean; weakest = item.label; }
  });
  return { count: mine.length, avg, weakest };
}

export function reviewsRu(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'разбор' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'разбора' : 'разборов';
  return `${n} ${word}`;
}
