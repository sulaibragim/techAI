import { ServiceRate } from './types';
import { nightPriceOf } from './priceBook';

// Phone scripts for the intake screen: what the manager says (English, to the caller) and
// a hint for the manager (Russian). TrustKey-specific — Arizona facts, trustkeyaz.com prices.
// Source of the wording: training/02-call-scripts.md (research in training/research/).
//
// Tokens inside `say`:
//   {me}            the manager's first name
//   {price:<id>}    price-book rate by id — +$60 when the night rate is on
//   {night}         " — our after-8PM rate" at night, nothing by day: the surcharge is said, not hidden
//   [anything]      a slot the manager fills in out loud (tech name, ETA window, address…);
//                   [name], [Tech] and [address] show what's already typed in the form

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
  | 'cheaper' | 'discount' | 'web20' | 'eta' | 'licensed' | 'bonded' | 'roc' | 'years' | 'shop'
  | 'exact' | 'dealer' | 'ownfob' | 'fobdead' | 'damage' | 'noid' | 'think' | 'written'
  | 'warranty' | 'receipt' | 'european' | 'outofarea' | 'angry' | 'unsure' | 'tenant';

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
  say: "Let me check who's closest for you… [Tech] can be there in about [X–Y] minutes.",
  hint: 'Время — только из CRM и окном («25–35 минут»), никогда «15 минут» наугад. Нужно дольше 10 секунд — спроси: «Can I put you on a quick hold? About 30 seconds.» Вернулся: «Thanks for holding, [name].»',
};

// The same three questions open every urgent call: where, who, and a number that works.
const whereWho = (where: string, hint?: string): ScriptStep => ({
  title: 'Где и кто',
  say: `${where} … And who am I speaking with? … Thanks, [name] — is this the best number to reach you?`,
  hint: `Имя — в первые минуты, дальше обращайся по имени 2–3 раза за звонок.${hint ? ' ' + hint : ''}`,
});

// The last thing the caller hears is what they remember the call by — warm, concrete, what happens next.
const goodbye = (say: string, hint?: string): ScriptStep => ({
  title: 'Прощание',
  say,
  hint: hint || 'Тепло и коротко: спасибо, имя, что будет дальше. Конец звонка клиент запоминает лучше всего.',
});

export const CALL_SCRIPTS: Record<ScriptId, CallScript> = {
  opening: {
    id: 'opening',
    label: 'Начало звонка',
    rates: [RATE.carLockout, RATE.homeLockout],
    objections: ['cheaper', 'eta', 'licensed', 'bonded', 'years', 'shop', 'outofarea', 'unsure', 'web20'],
    steps: [
      { title: 'Приветствие', say: `Thanks for calling ${COMPANY}, this is {me}. Are you locked out, or is it something else?`, hint: 'Улыбнись — это слышно. Название компании и своё имя — сразу доверие. Не «How can I help?» — сразу к делу.' },
      { title: 'Что случилось', say: 'Is it a car, a home, or a business?', hint: 'По ответу выбери шаблон слева — скрипт сам переключится. Непонятно — «Start from scratch».' },
      { title: 'Если нервничает', say: "That sounds really stressful — you called the right place, and I'll get you sorted.", hint: 'Одна фраза сочувствия — и сразу вопрос. Голос ниже и медленнее. Без «I understand».' },
      { title: 'Сразу спросил цену', say: 'Good question to ask first. Is it a car or a house?', hint: 'Один уточняющий вопрос — и сразу полная цена. Никогда не уходить от ответа: для локсмита это признак мошенника.' },
      { title: 'Если не записывается', say: "Of course. If anything changes, just call or text this number — we're here around the clock. Thanks for calling TrustKey.", hint: 'Отпусти тепло — такие клиенты перезванивают. Потом закрой New Job и отметь причину.' },
    ],
  },

  'car-lockout': {
    id: 'car-lockout',
    label: 'Car lockout',
    emergency: true,
    rates: [RATE.carLockout],
    objections: ['cheaper', 'eta', 'damage', 'licensed', 'noid', 'angry', 'think', 'discount', 'web20'],
    steps: [
      { title: 'Безопасность', say: 'First — is anyone or a pet inside the car?', hint: 'ДА → сразу 911, фраза ниже. Жара в Аризоне опасна за минуты.', alert: true, call911: true },
      { title: 'Где ключи', say: 'Are the keys inside the car, or are they lost?', hint: 'Потеряны → это не lockout, а All Keys Lost: переключи скрипт. Сломался в замке → Broken key.' },
      whereWho('What city are you in right now?', 'Другой город → если техник доедет ≤ ~30 мин, берём.'),
      { title: 'Машина', say: "What's the car — year and make?", hint: 'Для техника. Заполни Make / Model в форме.' },
      { title: 'Цена', say: "It's {price:r-car-lockout} total{night}. That's the trip and opening the car — nothing added at the door.", hint: 'Уверенно, одной фразой — и пауза. После 8PM цена и слова про ночной тариф появятся сами.' },
      ETA,
      { title: 'Адрес', say: "What's the exact address, and where exactly is the car parked?", hint: 'Не «хотите, чтобы приехали?» — сразу адрес. Парковка, этаж гаража, ориентир.' },
      { title: 'Детали', say: "Please have your ID and registration handy — we check that on every car; it protects you. You pay after it's done — card, cash, Apple Pay or Google Pay — and you'll get a receipt by text or email.", hint: 'Документы в машине — ок, техник проверит сразу после вскрытия.' },
      { title: 'Повтор', say: "So I have [name] at [address] — car lockout, {price:r-car-lockout} total. I'm sending [Tech]; about [X–Y] minutes. You'll get a text with [Tech]'s name and photo in a minute.", hint: 'Повтори всё — клиент слышит, что его поняли правильно.' },
      goodbye("Thanks for calling TrustKey, [name]. [Tech] will text you from the road — if anything changes, just text this number. And try to find some shade while you wait.", 'Тепло и коротко. Забота про жару — то, что клиент запомнит.'),
    ],
  },

  'car-key': {
    id: 'car-key',
    label: 'Car key (spare / new)',
    rates: [RATE.keyNoChip, RATE.transponder, RATE.remoteFob, RATE.smartKey],
    objections: ['exact', 'dealer', 'ownfob', 'fobdead', 'european', 'eta', 'think', 'warranty'],
    steps: [
      { title: 'Есть ли ключ', say: 'Happy to help with that. Do you have a working key right now, or are all keys lost?', hint: 'Нет ни одного → переключи на All Keys Lost.' },
      { title: 'Машина', say: "What's the year, make and model?", hint: 'Введи Make / Model — ниже в форме CRM покажет тип ключа и сложность. «Dealer / bench» → честно говорим, что это к дилеру.' },
      { title: 'Тип ключа', say: 'Is it push-to-start, or do you turn a key? Does your key have buttons on it?', hint: 'Кнопка Start → smart key. Кнопки на ключе → remote / fob. Без кнопок → чиповый (transponder). Старая машина и простой металлический ключ → «no chip»: только нарезка, цена точная.' },
      { title: 'Цена', say: "For your [car], a [key type] starts from [price above] — that's the key, cutting and programming, all done at your car. The tech confirms the exact price before any work starts, and the $59 service call is credited toward the job.", hint: 'Цены по типам — вверху панели. Для ключей с чипом слово «from» обязательно: точную цену подтверждает техник. Ключ без чипа — без программирования, цена точная.' },
      { title: 'Сколько ключей', say: 'How many keys would you like?', hint: 'Два ключа — второй про запас. Предложи один раз, без нажима.' },
      { title: 'Когда', say: 'Would today work, or would you like to schedule it — morning or afternoon?', hint: 'Плановая работа → предлагай выбор, а не «когда вам удобно?».' },
      { title: 'Адрес и имя', say: "What's the address where the car will be? … And the name for the appointment?" },
      { title: 'Документы', say: 'Please have your ID and the registration or title ready — we check that before making any car key.', hint: 'Без документов ключ не делаем.', alert: true },
      { title: 'Повтор', say: "So I have [name] at [address] — a [key type] for your [car], starting from [price], confirmed before any work. [Tech], [day / time]." },
      goodbye("Thanks, [name] — you're all set. You'll get a text with [Tech]'s name and photo before the visit, and if anything changes, just text this number."),
    ],
  },

  akl: {
    id: 'akl',
    label: 'All keys lost',
    rates: [RATE.akl],
    objections: ['exact', 'european', 'dealer', 'eta', 'noid', 'angry', 'think'],
    steps: [
      { title: 'Сочувствие', say: "That's a tough spot — the good news is we can make a new key right at your car, no tow needed.", hint: 'Формула стресса: назови → успокой → действуй.' },
      { title: 'Машина', say: "What's the year, make and model — push-to-start or turn key?", hint: 'Mercedes ≈2015+, VW / Audi ≈2017+, новые BMW — часто только дилер. Проверь панель ключей ниже в форме.' },
      whereWho('Where is the car right now?'),
      { title: 'Цена', say: 'With no key at all we make one from scratch — for your car it starts from {price:r-all-keys-lost}{night}, all done at the car. The tech confirms the exact price before any work, and the $59 service call is credited toward the job.', hint: 'Точную цену называет техник на месте, до начала работы.' },
      ETA,
      { title: 'Адрес', say: "What's the exact address where the car is?" },
      { title: 'Документы', say: "Since we're making a key from scratch, we'll need your ID and the registration or title — that's how we make sure keys only go to the owner.", hint: 'Жёстко: без документов ключ не делаем.', alert: true },
      { title: 'Повтор', say: "So I have [name] at [address] — a new key for your [car], starting from {price:r-all-keys-lost}. I'm sending [Tech]; about [X–Y] minutes. You'll get a text with [Tech]'s name and photo." },
      goodbye("Thanks for calling TrustKey, [name]. [Tech] will text you from the road — keep your ID and registration handy, and just text this number if anything changes."),
    ],
  },

  'home-lockout': {
    id: 'home-lockout',
    label: 'Home lockout',
    emergency: true,
    rates: [RATE.homeLockout, RATE.rekey],
    objections: ['cheaper', 'eta', 'damage', 'licensed', 'angry', 'think', 'discount', 'web20', 'tenant'],
    steps: [
      { title: 'Безопасность', say: 'First — is anyone inside who needs help? A child alone, someone unwell, a stove on?', hint: 'ДА → сразу 911, фраза ниже.', alert: true, call911: true },
      whereWho('What city are you in?', 'Другой город → если техник доедет ≤ ~30 мин, берём.'),
      { title: 'Замок', say: "Is it the deadbolt that's locked, or just the handle?", hint: 'Для техника, на цену не влияет.' },
      { title: 'Цена', say: "To get you in, it's {price:r-home-lockout} total{night}. That's the trip and the work — nothing added at the door.", hint: 'Уверенно, одной фразой — и пауза.' },
      ETA,
      { title: 'Адрес', say: "What's the exact address — any gate code or unit number?", hint: 'Код ворот → поле «Gate / callbox code».' },
      { title: 'Детали', say: "Please have an ID handy when [Tech] arrives. You pay after you're inside — card, cash, Apple Pay or Google Pay.", hint: 'ID — формальность, без нажима.' },
      { title: 'Rekey (если ключи потеряны)', say: "Were the keys lost, or just locked inside? If they're lost, a lot of people have the lock rekeyed while the tech is there — then the old keys stop working. It's {price:r-rekey} for the first door.", hint: 'Только если ключи ПОТЕРЯНЫ. Один раз, без давления: кто найдёт ключи — откроет дверь.' },
      { title: 'Повтор', say: "So I have [name] at [address] — home lockout, {price:r-home-lockout} total. I'm sending [Tech]; about [X–Y] minutes. You'll get a text with [Tech]'s name and photo." },
      goodbye("Thanks for calling TrustKey, [name]. [Tech] will text you from the road — if anything changes, just text this number. We'll get you back inside."),
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
      whereWho('What city are you in?'),
      { title: 'Цена', say: 'Getting the broken piece out is {price:r-key-extraction}{night}. If you need a new key after that, the tech tells you that price before making it.', hint: 'Извлечение — цена точная. Новый ключ — отдельно: для машины по типу ключа (скрипт Car key).' },
      ETA,
      { title: 'Адрес', say: "What's the exact address — and which door, or where is the car parked?" },
      { title: 'Детали', say: "Please have your ID handy — for a car, the registration too. You pay after it's done — card, cash, Apple Pay or Google Pay." },
      { title: 'Повтор', say: "So I have [name] at [address] — broken key extraction, {price:r-key-extraction}. I'm sending [Tech]; about [X–Y] minutes. You'll get a text with [Tech]'s name and photo." },
      goodbye("Thanks for calling TrustKey, [name]. [Tech] will text you from the road — and if anything changes, just text this number."),
    ],
  },

  rekey: {
    id: 'rekey',
    label: 'Rekey',
    rates: [RATE.rekey],
    objections: ['exact', 'licensed', 'warranty', 'think', 'discount', 'web20'],
    steps: [
      { title: 'Причина', say: 'Is this after a move, or did keys get lost?', hint: 'Переезд → в конце пожелай «Enjoy the new place!».' },
      { title: 'Сколько дверей', say: 'How many doors have locks with keys — front, back, garage entry?', hint: 'Считай двери с ключевыми цилиндрами.' },
      { title: 'Rekey, а не замена', say: "Good news — most of the time you don't need new locks. We rekey the ones you have: old keys stop working, you get new keys, and it costs much less than replacing.", hint: 'Если клиент говорит «change the locks». Сэкономить деньги клиенту — лучшее начало доверия.' },
      { title: 'Цена', say: "It's {price:r-rekey} for the first door and $49 for each extra door.", hint: 'Посчитай вслух: 3 двери днём = $247, после 8PM +$60 на заказ = $307.' },
      { title: 'Один ключ на всё', say: 'Would you like one key for all the doors? If the locks are the same brand, we can do that at the same time.' },
      { title: 'Когда', say: 'Would today or tomorrow work better — morning or afternoon?', hint: 'Выбор, а не «когда удобно?».' },
      { title: 'Адрес и имя', say: "What's the address? … And the name for the appointment?" },
      { title: 'Повтор', say: 'So I have [name] at [address] — rekey for [N] doors, [total] total, [day / time].' },
      goodbye("Thanks, [name] — you're all set. [Tech] will text you before the visit. And if anything changes, just text this number.", 'Тепло и коротко. Если переезд — «Enjoy the new place!».'),
    ],
  },

  commercial: {
    id: 'commercial',
    label: 'Commercial',
    rates: [RATE.commLockout],
    objections: ['cheaper', 'eta', 'licensed', 'bonded', 'roc', 'noid', 'think'],
    steps: [
      { title: 'Кто звонит', say: 'Are you the owner or the manager of the business?', hint: 'Техник попросит ID и документ, что человек вправе открыть (аренда, письмо владельца).' },
      whereWho('What city is the business in?'),
      { title: 'Цена (вскрытие)', say: "To get you in, it's {price:r-comm-lockout} total{night}. That's the trip and the work — nothing added at the door." },
      ETA,
      { title: 'Адрес', say: "What's the exact address — which door or suite?" },
      { title: 'Документы', say: "Please have your ID and something that shows you're authorized for the business." },
      { title: 'Проекты — только владелец', say: 'For a project like this, the owner calls you back personally to set up a walkthrough and a written estimate. What\'s the best time to reach you?', hint: 'Master key, access control, panic bars — НЕ записывай сам: имя, телефон, что нужно, сколько дверей → владельцу. Panic bars без лицензии подрядчика запрещены законом.', alert: true },
      goodbye('Thanks for calling TrustKey, [name]. [Tech] will text you from the road — and if anything changes, just text this number.'),
    ],
  },

  safe: {
    id: 'safe',
    label: 'Safe opening',
    rates: [RATE.safe],
    objections: ['exact', 'damage', 'noid', 'think'],
    steps: [
      { title: 'Какой сейф', say: 'What kind of safe is it — dial, keypad, or key? Do you know the brand?' },
      { title: 'Что случилось', say: 'Did you forget the combination, is the battery dead, or is something broken?', hint: 'Кнопочный + села батарейка — иногда решается заменой батарейки. Скажи об этом — клиент запомнит честность.' },
      { title: 'Цена', say: 'Safe openings start from {price:r-safe-open}{night}. The tech looks at it first and gives you the exact price before any work.' },
      { title: 'Когда', say: 'Would today work, or would you like to schedule it?' },
      { title: 'Адрес, имя, документы', say: "What's the address, and the name for the appointment? Please have an ID handy — we open safes only for the owner." },
      { title: 'Повтор', say: 'So I have [name] at [address] — safe opening, starting from {price:r-safe-open}, [day / time].' },
      goodbye("Thanks, [name] — you're all set. [Tech] will text you before the visit, and if anything changes, just text this number."),
    ],
  },

  'lock-install': {
    id: 'lock-install',
    label: 'Lock install',
    rates: [RATE.install, RATE.smartLock],
    objections: ['exact', 'warranty', 'licensed', 'bonded', 'roc', 'think'],
    steps: [
      { title: 'Есть ли замок', say: 'Do you already have the lock, or would you like us to bring one?' },
      { title: 'Какой', say: 'Is it a deadbolt, a handle, or a smart lock?' },
      { title: 'Цена — свой замок', say: 'Installing your lock is from {price:r-lock-install}, and a smart lock from {price:r-smart-install}. The tech confirms the price before starting.' },
      { title: 'Цена — наш замок', say: 'A Schlage deadbolt, installed, is from $249 all in. A Schlage Encode smart lock is from $369 installed.', hint: 'Ещё: Kwikset Halo from $349, Yale Assure from $339, Grade 1 high-security from $279.' },
      { title: 'Лимит $1,000', say: 'How many doors are we talking about?', hint: 'Проект больше $1,000 всего (работа + материалы) → передай владельцу. Без лицензии подрядчика дробить заказ на части запрещено.', alert: true },
      { title: 'Когда', say: 'Would today or tomorrow work better — morning or afternoon?' },
      { title: 'Адрес и имя', say: "What's the address? … And the name for the appointment?" },
      { title: 'Повтор', say: 'So I have [name] at [address] — [what we install], from [price], [day / time].' },
      goodbye("Thanks, [name] — you're all set. [Tech] will text you before the visit, and if anything changes, just text this number."),
    ],
  },
};

// Every answer ends by moving the call forward — a question, usually toward the address.
// The hint starts with what the caller is really worried about: answer that, not the words.
export const OBJECTIONS: Record<ObjectionId, Objection> = {
  cheaper: {
    label: 'Someone quoted $39',
    say: "I can't speak for other companies — what I can tell you is our price is the total: the trip and the work, nothing added at the door. [Tech] can be there in about [X–Y] minutes. What's the address?",
    hint: 'За вопросом — страх переплатить: «$39» по телефону часто превращается в $300 на месте. Конкурентов не ругаем — говорим о своей итоговой цене и сразу к адресу.',
  },
  discount: {
    label: 'Can you do it cheaper?',
    say: "The price is the same for everyone, and you only pay after the job is done. What's the address? I'll get [Tech] on the way.",
    hint: 'Проверяет, можно ли продавить. Скидок менеджер не даёт — спокойно, дружелюбно, без оправданий.',
  },
  web20: {
    label: 'Website says $20 off',
    say: "The $20 off is for requests sent through the online form at trustkeyaz.com — you're welcome to use it. Or I can book you right now: what's the address?",
    hint: '$20 — долларов, не процентов, и только через форму. Предложи оба пути, без давления.',
  },
  eta: {
    label: 'How long?',
    say: "Let me check who's closest… about [X–Y] minutes. You'll get a text when [Tech] is on the way. What's the exact address?",
    hint: 'Хочет определённости. Только реальное время из CRM, окном — и сразу адрес.',
  },
  licensed: {
    label: 'Are you licensed?',
    say: "Good question. Arizona doesn't have a state locksmith license. We're a registered Arizona company and we carry liability insurance. Anything else I can answer before I get [Tech] on the way?",
    hint: 'Проверяет, не мошенники ли вы. Никогда «yes, licensed» — в Аризоне лицензии локсмита нет. Честный ответ сам вызывает доверие.',
  },
  bonded: {
    label: 'Are you bonded?',
    say: "No, we're not bonded. We're a registered Arizona company and we carry liability insurance — and you only pay after the job is done. Anything else I can answer before I get [Tech] on the way?",
    hint: 'Тот же страх, что и с «licensed». Bond у нас нет — говорим прямо; страховка (insured) есть, это другое.',
  },
  roc: {
    label: 'ROC number?',
    say: "We don't have one — we're not a licensed contractor, so we keep installs under the state's $1,000 limit. How many doors are we talking about?",
  },
  years: {
    label: 'How long in business?',
    say: "We're a new local company — TrustKey opened in June 2026. You get the price before any work starts, and keys we make and locks we install have a 30-day warranty. Anything else I can answer before we get you booked?",
    hint: 'Боится попасть на однодневку. Только правда: работаем с июня 2026. Не «уже год», не «since 2010».',
  },
  shop: {
    label: "Where's your shop?",
    say: "We're based in Mesa and fully mobile — no storefront. The tech comes to you in a marked vehicle. Where are you right now?",
    hint: 'Хочет понять, настоящая ли компания. Мобильность — это нормально, говори уверенно.',
  },
  exact: {
    label: 'Why no exact price?',
    say: "Every job is a little different, so I give you the honest starting price now, and the tech confirms the exact number before touching anything — you're never surprised. When works best for you?",
    hint: 'Боится сюрприза в счёте. Главное — «до начала работы».',
  },
  dealer: {
    label: 'The dealer is cheaper',
    say: 'Some dealers can be. The difference is we come to you — no tow to the dealer. Where is the car right now?',
    hint: 'Никаких «мы дешевле дилера на 30%».',
  },
  ownfob: {
    label: 'I bought a fob online',
    say: "We don't program fobs bought online — a lot of them are the wrong part or frequency, and used ones are often locked to the first car. People end up paying twice. We bring a proper key and program it fully. What's the year and model? I'll tell you what that key starts at.",
    hint: 'Без «вы купили ерунду». Цена — как у ключа этого типа.',
  },
  fobdead: {
    label: 'My fob stopped working',
    say: "Have you tried a new battery? It's usually a small coin battery — often that's all it is. With push-to-start, holding the fob right against the start button usually still starts the car. If that doesn't do it, call me back and we'll get you a new one.",
    hint: 'Честный совет → доверие и звонок в следующий раз. Не помогло — новый ключ по цене типа.',
  },
  damage: {
    label: 'Will you damage it?',
    say: "We always start with non-destructive methods. If a lock ever needs drilling, the tech tells you before starting. What's the exact address?",
    hint: 'Боится за дверь или машину. Не обещать «никогда не сверлим».',
  },
  noid: { label: "I don't have my ID", say: "Is it inside? That's fine — the tech checks it right after opening.", hint: 'Нет вообще → уточни у владельца или техника.' },
  angry: {
    label: 'Caller is upset / yelling',
    say: "It sounds like it's been a really rough day. … Let's get you sorted — where are you right now?",
    hint: 'Не спорь и не оправдывайся. Назови эмоцию, помолчи пару секунд, потом вопрос. Голос ниже и медленнее. Никогда «calm down».',
  },
  unsure: {
    label: "A question I can't answer",
    say: 'Good question — let me check that and call you right back in a few minutes. Is this the best number?',
    hint: 'Никогда не выдумывать. И перезвонить, как обещал.',
  },
  tenant: {
    label: "Open my tenant's door",
    say: "I'm sorry, we can't help with that one.",
    hint: 'Хозяин хочет открыть квартиру жильца или сменить ему замок — отказ: в Аризоне закон защищает жильцов. Сообщи владельцу.',
  },
  think: { label: 'Let me think about it', say: 'Of course. Can I text you the price and my name so you have it handy?', hint: 'Не уверен в цене или в компании — дай ему что-то в руки. Через 10–15 минут — follow-up СМС (шаблон в training/02).' },
  written: { label: 'Written quote?', say: 'Our prices are published on our website — can I text you the price right now?' },
  warranty: {
    label: 'What if it breaks?',
    say: 'Keys we make and locks we install have a 30-day warranty. When works best for you — today or tomorrow?',
    hint: 'Ровно 30 дней. Не год, не 90 дней.',
  },
  receipt: { label: 'Will I get a receipt?', say: "Yes — you'll get it by text or email. Which works better for you?" },
  european: {
    label: 'Can you do my BMW?',
    say: "Late-model BMW, Mercedes and Audi keys are often dealer-only — let me check yours before we send anyone, so you don't pay for a trip for nothing. What year and model is it?",
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
  { bad: 'Calm down', good: "«It sounds like it's been a really rough day.»" },
  { bad: 'Hold on… (и тишина)', good: "«Can I put you on a quick hold? About 30 seconds.»" },
  { bad: "I don't know", good: "«Let me check and call you right back.»" },
  { bad: "We'll try to get someone out", good: "«I'm sending [Tech] — about [X–Y] minutes.»" },
  { bad: 'Do you want us to come out?', good: "«What's the exact address?»" },
];

// How to sound — the part a script can't carry. Shown under the answers in the panel.
export const DELIVERY_TIPS: string[] = [
  'Улыбайся, когда говоришь, — это слышно.',
  'Клиент в стрессе → говори ниже и медленнее, короткими фразами. Одна фраза сочувствия — и сразу к делу.',
  'Имя клиента — в начале звонка, потом 2–3 раза, не чаще.',
  'Назвал цену — пауза. Не оправдывайся и не добавляй «ну примерно».',
  'Говори «I»: «I\'m sending [Tech]», а не «we\'ll try to get someone».',
  'Дослушай до конца, потом один вопрос. Не перебивай.',
  'Проверка дольше 10 секунд → «Can I put you on a quick hold?». Вернулся → «Thanks for holding».',
  'Закончи тепло: спасибо, имя, что будет дальше.',
];

// ─── The owner's edits ──────────────────────────────────────────────────────────────

/** Wording the owner changed in Settings, keyed by stepKey() / answerKey(). A blank `say` keeps the built-in line. */
export type ScriptOverrides = Record<string, { say?: string; hint?: string }>;

export const stepKey = (scriptId: ScriptId, step: Pick<ScriptStep, 'title'>) => `${scriptId}/${step.title}`;
export const answerKey = (id: ObjectionId) => `answer/${id}`;

export function scriptWithOverrides(script: CallScript, overrides: ScriptOverrides): CallScript {
  return {
    ...script,
    steps: script.steps.map(st => {
      const o = overrides[stepKey(script.id, st)];
      return o ? { ...st, say: o.say || st.say, hint: o.hint ?? st.hint } : st;
    }),
  };
}

export function answerWithOverrides(id: ObjectionId, overrides: ScriptOverrides): Objection {
  const base = OBJECTIONS[id];
  const o = overrides[answerKey(id)];
  return o ? { ...base, say: o.say || base.say, hint: o.hint ?? base.hint } : base;
}

// What an edited line must not claim (training/03-never-say.md). A warning, not a block —
// the owner decides; but "we're licensed" typed in a hurry should never go out unnoticed.
const HONESTY_RULES: { re: RegExp; warn: string }[] = [
  { re: /\b(we'?re|we are|i'?m|fully)\s+(licensed|bonded|certified)\b|\blicensed\s*(&|and)\s*bonded\b/i, warn: 'Лицензии и bond у нас нет — «licensed / bonded» говорить нельзя.' },
  { re: /(?<!(?:[–-]|to)\s?)\b\d{1,3}\s*min(?:ute)?s?\b/i, warn: 'Время приезда — только окном из CRM («[X–Y] minutes»), не одной цифрой.' },
  { re: /\b(?!30\b)(\d{1,3}|one|two|three)[- ]?(day|month|year)s?\b[^.]{0,20}\bwarrant|\bwarrant\w*[^.]{0,30}\b(?!30\b)(\d{1,3}|one|two|three)[- ]?(day|month|year)s?\b|\blifetime\b/i, warn: 'Гарантия — ровно 30 дней.' },
  { re: /\b(we'?re|we are)\s+(the\s+)?(best|#\s?1|number one|top[- ]rated|cheapest)\b|(\bbest|#\s?1|\bnumber one|\btop[- ]rated)\s+(locksmith|company|service|price|in town|in the valley)\b|\bcheapest\b/i, warn: '«Лучшие / №1 / самые дешёвые» — нельзя.' },
  { re: /\bsince (19|20)\d\d\b|\byears of experience\b/i, warn: 'Возраст бизнеса — только правда: открылись в июне 2026.' },
  { re: /\bnever drill|\bfree if\b|\bno (charge|fee) if\b/i, warn: '«Никогда не сверлим / бесплатно, если не откроем» — обещать нельзя.' },
  { re: /\b\d+\s*%\s*(off|cheaper|less|discount)/i, warn: 'Скидки в процентах и сравнения с дилером — нельзя. Скидка только $20 через форму на сайте.' },
];

export const honestyWarnings = (text: string): string[] =>
  HONESTY_RULES.filter(r => r.re.test(text)).map(r => r.warn);

// ─── Resolving tokens ───────────────────────────────────────────────────────────────

export interface ScriptContext {
  priceBook: ServiceRate[];
  night: boolean;
  me: string;
  /** What the form already knows — shown in place of [name], [Tech], [address]. */
  fill?: Partial<Record<FillSlot, string>>;
}

export type FillSlot = 'name' | 'Tech' | 'address';
const FILL_SLOTS: FillSlot[] = ['name', 'Tech', 'address'];

export type ScriptSegment =
  | { kind: 'text'; value: string }
  | { kind: 'price'; value: string }
  | { kind: 'slot'; value: string }
  | { kind: 'filled'; value: string };

export const NIGHT_NOTE = ' — our after-8PM rate';

/** The price to quote: the live price book wins, the script's own number is the fallback; +$60 at night. */
export function ratePrice(ref: Pick<ScriptRate, 'id' | 'price'>, priceBook: ServiceRate[], night: boolean): number {
  const price = priceBook.find(r => r.id === ref.id)?.price ?? ref.price;
  return night ? nightPriceOf({ price }) : price;
}

const TOKEN = /\{me\}|\{night\}|\{price:([a-z0-9-]+)\}|\[[^\]]+\]/g;

export function resolveScript(text: string, ctx: ScriptContext): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', value: text.slice(last, at) });
    const token = m[0];
    if (token === '{me}') {
      out.push({ kind: 'text', value: ctx.me || '[your name]' });
    } else if (token === '{night}') {
      if (ctx.night) out.push({ kind: 'text', value: NIGHT_NOTE });
    } else if (m[1]) {
      const ref = allRates().find(r => r.id === m[1]) ?? ctx.priceBook.find(r => r.id === m[1]);
      out.push(ref ? { kind: 'price', value: `$${ratePrice(ref, ctx.priceBook, ctx.night)}` } : { kind: 'slot', value: '[price]' });
    } else {
      const slot = token.slice(1, -1) as FillSlot;
      const known = FILL_SLOTS.includes(slot) ? ctx.fill?.[slot]?.trim() : '';
      out.push(known ? { kind: 'filled', value: known } : { kind: 'slot', value: token });
    }
    last = at + token.length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

export const scriptText = (text: string, ctx: ScriptContext): string =>
  resolveScript(text, ctx).map(s => s.value).join('');

const allRates = (): ScriptRate[] => Object.values(RATE);
