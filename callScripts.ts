import { ServiceRate } from './types';
import { nightPriceOf } from './priceBook';

// Phone scripts for the intake screen: what the manager says (English, to the caller) and
// a hint for the manager (Russian). TrustKey-specific — Arizona facts, trustkeyaz.com prices.
// Source of the wording: training/02-call-scripts.md (research in training/research/).
//
// Tokens inside `say`:
//   {me}            the manager's first name
//   {price:<id>}    price-book rate by id — +$60 when the night rate is on
//   [anything]      a slot the manager fills in out loud (tech name, ETA window, address…)

export type ScriptId =
  | 'opening'
  | 'car-lockout'
  | 'car-key'
  | 'akl'
  | 'home-lockout'
  | 'broken-key'
  | 'rekey'
  | 'commercial'
  | 'safe'
  | 'lock-install';

export interface ScriptStep {
  title: string;
  say: string;
  hint?: string;
  alert?: boolean; // a stop-and-check step (safety, legal limit)
  call911?: boolean; // the "anyone inside?" check — a yes means EMERGENCY_911 first
}

export interface ScriptRate {
  id: string;     // price-book id
  label: string;
  price: number;  // fallback when the rate is missing from the price book
  from?: boolean; // a starting price, confirmed on-site
}

export interface CallScript {
  id: ScriptId;
  label: string;
  rates: ScriptRate[];
  steps: ScriptStep[];
  objections: ObjectionId[];
  emergency?: boolean; // show the 911 rule
}

export type ObjectionId =
  | 'cheaper' | 'discount' | 'web20' | 'eta' | 'licensed' | 'roc' | 'years' | 'shop'
  | 'exact' | 'dealer' | 'ownfob' | 'fobdead' | 'damage' | 'noid' | 'think' | 'written'
  | 'warranty' | 'receipt' | 'european' | 'outofarea';

export interface Objection {
  label: string; // what the caller says
  say: string;
  hint?: string;
}

export const COMPANY = 'TrustKey Locksmith';

export const EMERGENCY_911 = {
  say: "Please hang up and call 911 right now — they'll get there fastest. Then call me back.",
  hint: 'Ребёнок или животное в закрытой машине, человеку плохо, плита, дым — сначала 911, потом мы.',
};

const RATE = {
  carLockout:  { id: 'r-car-lockout',    label: 'Car lockout',        price: 139 },
  homeLockout: { id: 'r-home-lockout',   label: 'Home lockout',       price: 159 },
  commLockout: { id: 'r-comm-lockout',   label: 'Commercial lockout', price: 199 },
  extraction:  { id: 'r-key-extraction', label: 'Key extraction',     price: 169 },
  rekey:       { id: 'r-rekey',          label: 'Rekey, 1st door',    price: 149 },
  keyNoChip:   { id: 'r-car-key',        label: 'Key, no chip',       price: 149 },
  transponder: { id: 'r-transponder',    label: 'Transponder key',    price: 149, from: true },
  remoteFob:   { id: 'r-remote-fob',     label: 'Remote / fob',       price: 199, from: true },
  smartKey:    { id: 'r-smart-key',      label: 'Smart key',          price: 279, from: true },
  akl:         { id: 'r-all-keys-lost',  label: 'All keys lost',      price: 349, from: true },
  safe:        { id: 'r-safe-open',      label: 'Safe opening',       price: 179, from: true },
  install:     { id: 'r-lock-install',   label: 'Install your lock',  price: 149, from: true },
  smartLock:   { id: 'r-smart-install',  label: 'Install smart lock', price: 189, from: true },
} satisfies Record<string, ScriptRate>;

const ETA: ScriptStep = {
  title: 'Время приезда',
  say: "Let me check who's closest… [Tech] can be there in about [X–Y] minutes.",
  hint: 'Время — только из CRM и окном («25–35 минут»). Никогда «15 минут» наугад.',
};

export const CALL_SCRIPTS: Record<ScriptId, CallScript> = {
  opening: {
    id: 'opening',
    label: 'Начало звонка',
    rates: [RATE.carLockout, RATE.homeLockout],
    objections: ['cheaper', 'eta', 'licensed', 'years', 'shop', 'outofarea', 'web20'],
    steps: [
      { title: 'Приветствие', say: `${COMPANY}, this is {me}. Are you locked out, or is it something else?`, hint: 'Название компании и своё имя — сразу доверие. Не «How can I help?» — сразу к делу.' },
      { title: 'Что случилось', say: 'Is it a car, a home, or a business?', hint: 'По ответу выбери шаблон слева — скрипт сам переключится. Непонятно — «Start from scratch».' },
      { title: 'Если нервничает', say: "That sounds really stressful — you called the right place. Let's get you sorted.", hint: 'Одна фраза сочувствия — и сразу вопрос. Голос ниже и медленнее. Без «I understand».' },
      { title: 'Сразу спросил цену', say: 'Good question to ask first. Is it a car or a house?', hint: 'Один уточняющий вопрос — и сразу полная цена. Никогда не уходить от ответа: для локсмита это признак мошенника.' },
    ],
  },

  'car-lockout': {
    id: 'car-lockout',
    label: 'Car lockout',
    emergency: true,
    rates: [RATE.carLockout],
    objections: ['cheaper', 'eta', 'damage', 'licensed', 'noid', 'think', 'discount', 'web20'],
    steps: [
      { title: 'Безопасность', say: 'Is anyone or a pet inside the car?', hint: 'ДА → сразу 911, фраза ниже. Жара в Аризоне опасна за минуты.', alert: true, call911: true },
      { title: 'Где ключи', say: 'Are the keys inside the car, or are they lost?', hint: 'Потеряны → это не lockout, а All Keys Lost: переключи скрипт. Сломался в замке → Broken key.' },
      { title: 'Где клиент', say: 'What city are you in — and is this the best number for you?', hint: 'Проверь зону. Другой город → если техник доедет ≤ ~30 мин, берём.' },
      { title: 'Машина', say: "What's the car — year and make?", hint: 'Для техника. Заполни Make / Model в форме.' },
      { title: 'Цена', say: "It's {price:r-car-lockout} total — that's the trip and opening the car, nothing added at the door.", hint: 'Уверенно, одной фразой. После 8PM цена сама станет ночной.' },
      ETA,
      { title: 'Адрес', say: "What's the exact address, and where exactly is the car parked?", hint: 'Не «хотите, чтобы приехали?» — сразу адрес. Парковка, этаж гаража, ориентир.' },
      { title: 'Детали', say: "Can I get your first name? Please have your ID and registration handy — we check that on every car, it protects you. You pay after it's done, and you'll get a receipt by text or email.", hint: 'Документы в машине — ок, техник проверит сразу после вскрытия.' },
      { title: 'Повтор', say: "So I have [name], [address], car lockout, {price:r-car-lockout} total, [Tech] in about [X–Y] minutes. You'll get a text with [Tech]'s name and photo in a minute.", hint: 'Повтори всё — клиент слышит, что его поняли правильно.' },
    ],
  },

  'car-key': {
    id: 'car-key',
    label: 'Car key (spare / new)',
    rates: [RATE.keyNoChip, RATE.transponder, RATE.remoteFob, RATE.smartKey],
    objections: ['exact', 'dealer', 'ownfob', 'fobdead', 'european', 'eta', 'think', 'warranty'],
    steps: [
      { title: 'Есть ли ключ', say: 'Do you have a working key right now, or are all keys lost?', hint: 'Нет ни одного → переключи на All Keys Lost.' },
      { title: 'Машина', say: "What's the year, make and model?", hint: 'Введи Make / Model — ниже в форме CRM покажет тип ключа и сложность. «Dealer / bench» → честно говорим, что это к дилеру.' },
      { title: 'Тип ключа', say: 'Is it push-to-start, or do you turn a key? Does your key have buttons on it?', hint: 'Кнопка Start → smart key. Кнопки на ключе → remote / fob. Без кнопок → чиповый (transponder). Старая машина и простой металлический ключ → «no chip»: только нарезка, цена точная.' },
      { title: 'Цена', say: "For your [car], a [key type] starts from [price above] — that's the key, cutting and programming, all done at your car. The tech confirms the exact price before any work starts, and the $59 service call is credited toward the job.", hint: 'Цены по типам — вверху панели. Для ключей с чипом слово «from» обязательно: точную цену подтверждает техник. Ключ без чипа — без программирования, цена точная.' },
      { title: 'Сколько ключей', say: 'How many keys would you like?' },
      { title: 'Когда', say: 'Would today work, or would you like to schedule it — morning or afternoon?', hint: 'Плановая работа → предлагай выбор, а не «когда вам удобно?».' },
      { title: 'Адрес', say: "What's the address where the car will be?" },
      { title: 'Документы', say: 'Please have your ID and the registration or title ready — we check that before making any car key.', hint: 'Без документов ключ не делаем.', alert: true },
      { title: 'Повтор', say: 'So I have [name], [address], a [key type] for your [car], starting from [price], confirmed before any work, [Tech] [day / time].' },
    ],
  },

  akl: {
    id: 'akl',
    label: 'All keys lost',
    rates: [RATE.akl],
    objections: ['exact', 'european', 'dealer', 'eta', 'noid', 'think'],
    steps: [
      { title: 'Сочувствие', say: "That's a tough spot — the good news is we can make a new key right at your car, no tow needed.", hint: 'Формула стресса: назови → успокой → действуй.' },
      { title: 'Машина', say: "What's the year, make and model — push-to-start or turn key?", hint: 'Mercedes ≈2015+, VW / Audi ≈2017+, новые BMW — часто только дилер. Проверь панель ключей ниже в форме.' },
      { title: 'Где машина', say: 'Where is the car right now — and is this the best number for you?' },
      { title: 'Цена', say: 'With no key at all we make one from scratch — for your car it starts from {price:r-all-keys-lost}, all done at the car. The tech confirms the exact price before any work, and the $59 service call is credited toward the job.', hint: 'Точную цену называет техник на месте, до начала работы.' },
      ETA,
      { title: 'Адрес', say: "What's the exact address where the car is?" },
      { title: 'Документы', say: "Since we're making a key from scratch, we'll need your ID and the registration or title — that's how we make sure keys only go to the owner.", hint: 'Жёстко: без документов ключ не делаем.', alert: true },
      { title: 'Повтор', say: "So I have [name], [address], a new key for your [car], starting from {price:r-all-keys-lost}, [Tech] in about [X–Y] minutes. You'll get a text with [Tech]'s name and photo." },
    ],
  },

  'home-lockout': {
    id: 'home-lockout',
    label: 'Home lockout',
    emergency: true,
    rates: [RATE.homeLockout, RATE.rekey],
    objections: ['cheaper', 'eta', 'damage', 'licensed', 'think', 'discount', 'web20'],
    steps: [
      { title: 'Безопасность', say: 'Is anyone inside who needs help — a child alone, someone unwell, a stove on?', hint: 'ДА → сразу 911, фраза ниже.', alert: true, call911: true },
      { title: 'Где клиент', say: 'What city are you in — and is this the best number for you?' },
      { title: 'Замок', say: "Is it the deadbolt that's locked, or just the handle?", hint: 'Для техника, на цену не влияет.' },
      { title: 'Цена', say: "It's {price:r-home-lockout} total to get you in — the trip and the work, nothing added at the door.", hint: 'Уверенно, одной фразой.' },
      ETA,
      { title: 'Адрес', say: "What's the exact address — any gate code or unit number?", hint: 'Код ворот → поле «Gate / callbox code».' },
      { title: 'Детали', say: "Please have an ID handy when [Tech] arrives. You pay after you're inside.", hint: 'ID — формальность, без нажима.' },
      { title: 'Rekey (если ключи потеряны)', say: "Were the keys lost, or just locked inside? If they're lost, a lot of people have the lock rekeyed while the tech is there — {price:r-rekey} for the first door.", hint: 'Только если ключи ПОТЕРЯНЫ. Один раз, без давления.' },
      { title: 'Повтор', say: "So I have [name], [address], home lockout, {price:r-home-lockout} total, [Tech] in about [X–Y] minutes. You'll get a text with [Tech]'s name and photo." },
    ],
  },

  'broken-key': {
    id: 'broken-key',
    label: 'Broken key',
    rates: [RATE.extraction],
    objections: ['damage', 'eta', 'cheaper', 'licensed', 'noid', 'think', 'discount', 'web20'],
    steps: [
      { title: 'Где сломался', say: 'Where did the key break — in a car or a house lock? Is it in the door or the ignition?', hint: 'Машина → Job Type «Auto», дом → «Home». Для техника: дверь или замок зажигания.' },
      { title: 'Можете войти', say: 'Can you still get in, or are you locked out right now?', hint: 'Заперт снаружи → приоритет Emergency.' },
      { title: 'Где клиент', say: 'What city are you in — and is this the best number for you?' },
      { title: 'Цена', say: 'Getting the broken piece out is {price:r-key-extraction}. If you need a new key after that, the tech tells you that price before making it.', hint: 'Извлечение — цена точная. Новый ключ — отдельно: для машины по типу ключа (скрипт Car key).' },
      ETA,
      { title: 'Адрес', say: "What's the exact address — and which door, or where is the car parked?" },
      { title: 'Детали', say: "Can I get your first name? Please have your ID handy — for a car, the registration too. You pay after it's done." },
      { title: 'Повтор', say: "So I have [name], [address], broken key extraction, {price:r-key-extraction}, [Tech] in about [X–Y] minutes. You'll get a text with [Tech]'s name and photo." },
    ],
  },

  rekey: {
    id: 'rekey',
    label: 'Rekey',
    rates: [RATE.rekey],
    objections: ['exact', 'licensed', 'warranty', 'think', 'discount', 'web20'],
    steps: [
      { title: 'Причина', say: 'Is this after a move, or did keys get lost?' },
      { title: 'Сколько дверей', say: 'How many doors have locks with keys — front, back, garage entry?', hint: 'Считай двери с ключевыми цилиндрами.' },
      { title: 'Rekey, а не замена', say: "Most of the time you don't need new locks — we rekey the ones you have. Old keys stop working, you get new keys, and it costs much less than replacing.", hint: 'Если клиент говорит «change the locks».' },
      { title: 'Цена', say: "It's {price:r-rekey} for the first door and $49 for each extra door.", hint: 'Посчитай вслух: 3 двери днём = $247, после 8PM = $307.' },
      { title: 'Один ключ на всё', say: 'Would you like one key for all the doors? If the locks are the same brand, we can do that at the same time.' },
      { title: 'Когда', say: 'Would today or tomorrow work better — morning or afternoon?', hint: 'Выбор, а не «когда удобно?».' },
      { title: 'Адрес', say: "What's the address?" },
      { title: 'Повтор', say: 'So I have [name], [address], rekey for [N] doors, [total] total, [day / time].' },
    ],
  },

  commercial: {
    id: 'commercial',
    label: 'Commercial',
    rates: [RATE.commLockout],
    objections: ['cheaper', 'eta', 'licensed', 'roc', 'noid', 'think'],
    steps: [
      { title: 'Кто звонит', say: 'Are you the owner or the manager of the business?', hint: 'Техник попросит ID и документ, что человек вправе открыть (аренда, письмо владельца).' },
      { title: 'Где', say: 'What city is the business in — and is this the best number for you?' },
      { title: 'Цена (вскрытие)', say: "It's {price:r-comm-lockout} total to get you in — the trip and the work, nothing added at the door." },
      ETA,
      { title: 'Адрес', say: "What's the exact address — which door or suite?" },
      { title: 'Документы', say: "Please have your ID and something that shows you're authorized for the business." },
      { title: 'Проекты — только владелец', say: 'For a project like this, the owner calls you back personally to set up a walkthrough and a written estimate. What\'s the best time to reach you?', hint: 'Master key, access control, panic bars — НЕ записывай сам: имя, телефон, что нужно, сколько дверей → владельцу. Panic bars без лицензии подрядчика запрещены законом.', alert: true },
    ],
  },

  safe: {
    id: 'safe',
    label: 'Safe opening',
    rates: [RATE.safe],
    objections: ['exact', 'damage', 'noid', 'think'],
    steps: [
      { title: 'Какой сейф', say: 'What kind of safe is it — dial, keypad, or key? Do you know the brand?' },
      { title: 'Что случилось', say: 'Did you forget the combination, is the battery dead, or is something broken?', hint: 'Кнопочный + села батарейка — иногда решается заменой батарейки.' },
      { title: 'Цена', say: 'Safe openings start from {price:r-safe-open} — the tech looks at it first and gives you the exact price before any work.' },
      { title: 'Когда', say: 'Would today work, or would you like to schedule it?' },
      { title: 'Адрес и документы', say: "What's the address? Please have an ID handy — we open safes only for the owner." },
      { title: 'Повтор', say: 'So I have [name], [address], safe opening, starting from {price:r-safe-open}, [day / time].' },
    ],
  },

  'lock-install': {
    id: 'lock-install',
    label: 'Lock install',
    rates: [RATE.install, RATE.smartLock],
    objections: ['exact', 'warranty', 'licensed', 'roc', 'think'],
    steps: [
      { title: 'Есть ли замок', say: 'Do you already have the lock, or would you like us to bring one?' },
      { title: 'Какой', say: 'Is it a deadbolt, a handle, or a smart lock?' },
      { title: 'Цена — свой замок', say: 'Installing your lock is from {price:r-lock-install}, and a smart lock from {price:r-smart-install}. The tech confirms the price before starting.' },
      { title: 'Цена — наш замок', say: 'A Schlage deadbolt, installed, is from $249 all in. A Schlage Encode smart lock is from $369 installed.', hint: 'Ещё: Kwikset Halo from $349, Yale Assure from $339, Grade 1 high-security from $279.' },
      { title: 'Лимит $1,000', say: 'How many doors are we talking about?', hint: 'Проект больше $1,000 всего (работа + материалы) → передай владельцу. Без лицензии подрядчика дробить заказ на части запрещено.', alert: true },
      { title: 'Когда', say: 'Would today or tomorrow work better — morning or afternoon?' },
      { title: 'Адрес', say: "What's the address?" },
      { title: 'Повтор', say: 'So I have [name], [address], [what we install], from [price], [day / time].' },
    ],
  },
};

export const OBJECTIONS: Record<ObjectionId, Objection> = {
  cheaper: {
    label: 'Someone quoted $39',
    say: "I can't speak for other companies — what I can tell you is our price is the total: the trip and the work, nothing added at the door. [Tech] can be there in about [X–Y] minutes. What's the address?",
    hint: 'Никогда не ругаем конкурентов. Говорим о своей цене.',
  },
  discount: { label: 'Can you do it cheaper?', say: "The price is the same for everyone, and you only pay after it's done.", hint: 'Скидок менеджер не даёт.' },
  web20: { label: 'Website says $20 off', say: 'The $20 off is for requests sent through the online form at trustkeyaz.com.', hint: '$20 — долларов, не процентов.' },
  eta: { label: 'How long?', say: "Let me check who's closest… about [X–Y] minutes. You'll get a text when [Tech] is on the way.", hint: 'Только реальное время из CRM, окном.' },
  licensed: {
    label: 'Are you licensed?',
    say: "Good question. Arizona doesn't have a state locksmith license. We're a registered Arizona company and we carry liability insurance.",
    hint: 'Никогда «yes, licensed». В Аризоне лицензии локсмита не существует.',
  },
  roc: { label: 'ROC number?', say: "We don't have one — we're not a licensed contractor, so we keep installs under the state's $1,000 limit." },
  years: {
    label: 'How long in business?',
    say: "We're a new local company — TrustKey opened in June 2026. You get the price before any work starts, and keys we make and locks we install have a 30-day warranty.",
    hint: 'Только правда: работаем с июня 2026. Не «уже год», не «since 2010».',
  },
  shop: { label: "Where's your shop?", say: "We're based in Mesa and fully mobile — no storefront. The tech comes to you in a marked vehicle." },
  exact: {
    label: 'Why no exact price?',
    say: 'Every job is a little different, so I give you the honest starting price now, and the tech confirms the exact number before touching anything.',
  },
  dealer: { label: 'The dealer is cheaper', say: 'Some dealers can be. The difference is we come to you — no tow to the dealer.', hint: 'Никаких «мы дешевле дилера на 30%».' },
  ownfob: {
    label: 'I bought a fob online',
    say: "We don't program fobs bought online — a lot of them are the wrong part or frequency, and used ones are often locked to the first car. People end up paying twice. We bring a proper key and program it fully.",
    hint: 'Без «вы купили ерунду». Цена — как у ключа этого типа.',
  },
  fobdead: {
    label: 'My fob stopped working',
    say: "Have you tried a new battery? It's usually a small coin battery — often that's all it is. With push-to-start, holding the fob right against the start button usually still starts the car.",
    hint: 'Честный совет → доверие. Не помогло — новый ключ по цене типа.',
  },
  damage: {
    label: 'Will you damage it?',
    say: 'We always start with non-destructive methods. If a lock ever needs drilling, the tech tells you before starting.',
    hint: 'Не обещать «никогда не сверлим».',
  },
  noid: { label: "I don't have my ID", say: "Is it inside? That's fine — the tech checks it right after opening.", hint: 'Нет вообще → уточни у владельца или техника.' },
  think: { label: 'Let me think about it', say: 'Of course. Can I text you the price and my name so you have it handy?', hint: 'Через 10–15 минут — follow-up СМС (шаблон в training/02).' },
  written: { label: 'Written quote?', say: 'Our prices are published on our website — I can text you the price right now.' },
  warranty: { label: 'What if it breaks?', say: 'Keys we make and locks we install have a 30-day warranty.', hint: 'Ровно 30 дней. Не год, не 90 дней.' },
  receipt: { label: 'Will I get a receipt?', say: "Yes — you'll get it by text or email, whichever you prefer." },
  european: {
    label: 'Can you do my BMW?',
    say: "Late-model BMW, Mercedes and Audi keys are often dealer-only — let me check yours by year and model before we send anyone, so you don't pay for a trip for nothing.",
  },
  outofarea: { label: "I'm outside your area", say: 'How urgent is it? Let me see if a tech can get to you quickly.', hint: 'Техник доедет ≤ ~30 мин по CRM — берём. Дальше — честно отказываем.' },
};

export const NEVER_SAY: { bad: string; good: string }[] = [
  { bad: "We're licensed", good: "Arizona doesn't have a state locksmith license — we're registered and insured" },
  { bad: "He'll be there in 15 minutes (наугад)", good: 'Только время из CRM, окном' },
  { bad: '1-year warranty', good: '30-day warranty on locks we install and keys we make' },
  { bad: "We're the best / #1 / top-rated", good: 'Говорим, как работаем: цена заранее, оплата после' },
  { bad: '30% cheaper than the dealer', good: 'We come to you — no tow to the dealer' },
  { bad: 'We never drill / free if we can’t', good: 'Non-destructive first; drilling explained before' },
  { bad: 'Your key will be exactly $149', good: 'Starts from $149, confirmed before any work' },
  { bad: 'I think… maybe… around…', good: "Уверенно: «It's $139 total.»" },
];

// ─── Resolving tokens ───────────────────────────────────────────────────────────────

export interface ScriptContext {
  priceBook: ServiceRate[];
  night: boolean;
  me: string;
}

export type ScriptSegment =
  | { kind: 'text'; value: string }
  | { kind: 'price'; value: string }
  | { kind: 'slot'; value: string };

/** The price to quote: the live price book wins, the script's own number is the fallback; +$60 at night. */
export function ratePrice(ref: Pick<ScriptRate, 'id' | 'price'>, priceBook: ServiceRate[], night: boolean): number {
  const price = priceBook.find(r => r.id === ref.id)?.price ?? ref.price;
  return night ? nightPriceOf({ price }) : price;
}

const TOKEN = /\{me\}|\{price:([a-z0-9-]+)\}|\[[^\]]+\]/g;

export function resolveScript(text: string, ctx: ScriptContext): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', value: text.slice(last, at) });
    const token = m[0];
    if (token === '{me}') {
      out.push({ kind: 'text', value: ctx.me || '[your name]' });
    } else if (m[1]) {
      const ref = allRates().find(r => r.id === m[1]) ?? ctx.priceBook.find(r => r.id === m[1]);
      out.push(ref ? { kind: 'price', value: `$${ratePrice(ref, ctx.priceBook, ctx.night)}` } : { kind: 'slot', value: '[price]' });
    } else {
      out.push({ kind: 'slot', value: token });
    }
    last = at + token.length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

export const scriptText = (text: string, ctx: ScriptContext): string =>
  resolveScript(text, ctx).map(s => s.value).join('');

const allRates = (): ScriptRate[] => Object.values(RATE);
