import { ServiceRate } from './types';
import { CALL_SCRIPTS, ScriptRate, ratePrice } from './callScripts';
import { NIGHT_SURCHARGE } from './priceBook';

// The admission test for the phone desk. Prices come from the live price book, so the test
// is right the day the owner changes a price; the rules come from trainingContent.ts.
// Passing means every answer right — a wrong price on the phone is a lost job or a fight.

export interface QuizQuestion {
  id: string;
  kind: 'price' | 'zone' | 'rule';
  q: string;
  options: string[];
  correct: number;
  why: string;
}

/** The shape of a hand-written rule question (trainingContent.ts). */
export interface RuleQ { id: string; q: string; options: string[]; correct: number; why: string }

export const SERVICE_AREA = ['Mesa', 'Chandler', 'Gilbert', 'Tempe', 'Scottsdale', 'Phoenix', 'Peoria', 'Queen Creek', 'Ahwatukee'];
const OUTSIDE_AREA = ['Glendale', 'Apache Junction', 'Fountain Hills', 'San Tan Valley', 'Maricopa', 'Surprise', 'Goodyear', 'Avondale'];
export const EXTRA_DOOR = 49; // rekey, each door after the first (training/01)

export const QUIZ_SHAPE = { prices: 7, rekey: 1, inArea: 2, outOfArea: 1, rules: 10 };

type Rng = () => number;

const shuffle = <T,>(xs: T[], rng: Rng): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pick = <T,>(xs: T[], n: number, rng: Rng) => shuffle(xs, rng).slice(0, n);

/** Every rate a script quotes, once. */
export const quotedRates = (): ScriptRate[] => {
  const seen = new Map<string, ScriptRate>();
  for (const s of Object.values(CALL_SCRIPTS)) for (const r of s.rates) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()];
};

/** Four answers, the right one among them, and where it landed. */
function choices(right: string, wrong: string[], rng: Rng): { options: string[]; correct: number } {
  const options = shuffle([right, ...wrong.filter((w, i) => w !== right && wrong.indexOf(w) === i).slice(0, 3)], rng);
  return { options, correct: options.indexOf(right) };
}

export function priceQuestion(rate: ScriptRate, priceBook: ServiceRate[], night: boolean, rng: Rng): QuizQuestion {
  const day = ratePrice(rate, priceBook, false);
  const price = night ? day + NIGHT_SURCHARGE : day;
  const fmt = (n: number) => `${rate.from ? 'from ' : ''}$${n}`;
  // The day/night mix-up is the mistake worth catching; the others are near misses.
  const mixUp = night ? day : day + NIGHT_SURCHARGE;
  const wrong = [mixUp, ...pick([price - 10, price + 10, price + 20, price - 20].filter(n => n > 0 && n !== mixUp), 2, rng)].map(fmt);
  return {
    id: `price-${rate.id}-${night ? 'night' : 'day'}`,
    kind: 'price',
    q: `Клиент спрашивает цену: «${rate.label}», ${night ? 'звонок после 8PM' : 'днём'}. Что называешь?`,
    ...choices(fmt(price), wrong, rng),
    why: `${rate.label}: ${fmt(day)} днём, ${fmt(day + NIGHT_SURCHARGE)} после 8PM — ночью +$60 к любому заказу.${rate.from ? ' «From» — точную цену техник подтверждает до начала работы.' : ''}`,
  };
}

export function rekeyQuestion(priceBook: ServiceRate[], doors: number, night: boolean, rng: Rng): QuizQuestion {
  const rekey = CALL_SCRIPTS.rekey.rates[0];
  const first = ratePrice(rekey, priceBook, false);
  const surcharge = night ? NIGHT_SURCHARGE : 0;
  const total = first + (doors - 1) * EXTRA_DOOR + surcharge;
  const wrong = [first * doors + surcharge, night ? total - NIGHT_SURCHARGE : total + NIGHT_SURCHARGE, total + EXTRA_DOOR].map(n => `$${n}`);
  return {
    id: `rekey-${doors}-${night ? 'night' : 'day'}`,
    kind: 'price',
    q: `Rekey: ${doors} двери, ${night ? 'после 8PM' : 'днём'}. Сколько всего?`,
    ...choices(`$${total}`, wrong, rng),
    why: `Первая дверь $${first}, каждая следующая +$${EXTRA_DOOR}${night ? ', и ночью +$60 один раз на весь заказ' : ''}: $${total}.`,
  };
}

const GO = 'Едем — это наш район';
const CHECK = 'Спросить, насколько срочно, и проверить в CRM, доедет ли техник примерно за 30 минут';
const REFUSE = 'Сразу вежливо отказать — это не наш город';
const ELSEWHERE = 'Посоветовать найти локсмита поближе, ничего не проверяя';

export function zoneQuestion(city: string, rng: Rng): QuizQuestion {
  const inArea = SERVICE_AREA.includes(city);
  return {
    id: `zone-${city.toLowerCase().replace(/\s+/g, '-')}`,
    kind: 'zone',
    q: `Клиент звонит из ${city}. Что делаешь?`,
    ...choices(inArea ? GO : CHECK, [REFUSE, ELSEWHERE, inArea ? CHECK : GO], rng),
    why: inArea
      ? `${city} — в нашем списке: ${SERVICE_AREA.join(', ')}.`
      : `${city} нет в списке. Спроси, насколько срочно, и посмотри в CRM: доедет ближайший техник за ~30 минут — едем, дальше — честно отказываем.`,
  };
}

const ruleQuestion = (r: RuleQ, rng: Rng): QuizQuestion => ({
  id: r.id,
  kind: 'rule',
  q: r.q,
  ...choices(r.options[r.correct], r.options.filter((_, i) => i !== r.correct), rng),
  why: r.why,
});

export function buildQuiz(priceBook: ServiceRate[], rules: RuleQ[], rng: Rng = Math.random): QuizQuestion[] {
  return shuffle([
    ...pick(quotedRates(), QUIZ_SHAPE.prices, rng).map(r => priceQuestion(r, priceBook, rng() < 0.4, rng)),
    rekeyQuestion(priceBook, 2 + Math.floor(rng() * 3), rng() < 0.5, rng),
    ...pick(SERVICE_AREA, QUIZ_SHAPE.inArea, rng).map(c => zoneQuestion(c, rng)),
    ...pick(OUTSIDE_AREA, QUIZ_SHAPE.outOfArea, rng).map(c => zoneQuestion(c, rng)),
    ...pick(rules, QUIZ_SHAPE.rules, rng).map(r => ruleQuestion(r, rng)),
  ], rng);
}
