import type { ScriptId } from './callScripts';

// Training data for the manager admission test and practice calls. Source: training/01–03 + callScripts.ts.
// Price amounts and service-area cities are not here on purpose: those questions are generated from live data.

export interface RuleQuestion {
  id: string;        // kebab-case, unique
  q: string;         // Russian: the situation or question. A caller's quote goes in English inside «…»
  options: string[]; // 3–4 options. If the option is what to SAY, write it in English; if it is an ACTION, in Russian
  correct: number;   // index of the right option
  why: string;       // Russian, 1–2 sentences: why this is right / what rule it is
}

export interface RolePlay {
  id: string;        // kebab-case, unique
  title: string;     // Russian, short (≤ 40 chars)
  script: ScriptId;  // which call script this call uses
  caller: string;    // Russian: who is calling and the situation — instructions for the colleague who PLAYS the client
  opening: string;   // English: the caller's first line
  twists: string[];  // English: 2–4 lines the "client" throws in during the call (questions, objections, stress)
  mustDo: string[];  // Russian: 4–7 checklist items the manager must do or say to pass
  traps: string[];   // Russian: 2–4 things the manager must NOT do or say
}

export const RULE_QUESTIONS: RuleQuestion[] = [
  {
    id: "licensed",
    q: "Клиент, прежде чем дать адрес, спрашивает: «Are you guys licensed?» Что ответить?",
    options: [
      "Yes, we're fully licensed and bonded, so you're in good hands.",
      "We have a city business license, so yes — we're fully licensed here in Arizona. We've been doing this a long time, so there's really nothing to worry about.",
      "Good question. Arizona doesn't have a state locksmith license. We're a registered Arizona company and we carry liability insurance.",
      "Of course — we're state-certified, and all our techs are background-checked.",
    ],
    correct: 2,
    why: "В Аризоне нет государственной лицензии локсмита, поэтому «yes, licensed» — неправда, а городская бизнес-лицензия — не профессиональная лицензия. Говорим как есть: зарегистрированная компания со страховкой.",
  },
  {
    id: "bonded",
    q: "Клиент уточняет: «Okay, but are you bonded?» Что ответить?",
    options: [
      "No, we're not bonded. We're a registered Arizona company and we carry liability insurance — and you only pay after the job is done.",
      "Yes, we're licensed, bonded and insured — fully covered, so if anything goes wrong at your place, the bond takes care of it and you have nothing to worry about.",
      "Bonded and insured mean the same thing — so yes, we're bonded.",
      "Every locksmith in Arizona has to be bonded, so of course we are.",
    ],
    correct: 0,
    why: "Bond у компании нет, а страховка есть — это разные вещи, и «insured» говорить можно. Ответить «yes, bonded» — значит соврать о компании, а за неправду Google уже снимал наш профиль.",
  },
  {
    id: "years-in-business",
    q: "Осторожный клиент спрашивает: «How long have you been in business?» Что ответить?",
    options: [
      "Oh, we've been around since 2010.",
      "About a year now.",
      "Our techs have over 15 years of experience between them, so you're in good hands — we've seen pretty much every lock and every car out there, and we get it done right the first time.",
      "We're a new local company — TrustKey opened in June 2026. You get the price before any work starts, and keys we make and locks we install have a 30-day warranty.",
    ],
    correct: 3,
    why: "Только правда: TrustKey открылась в июне 2026. Годы и «опыт» не прибавляем — сразу говорим, что гарантируем: цену до начала работы и 30 дней гарантии.",
  },
  {
    id: "warranty",
    q: "Клиент заказывает запасной ключ к машине: «What if it stops working? Do you give any warranty?»",
    options: [
      "Absolutely — you get a 1-year warranty.",
      "Keys we make and locks we install have a 30-day warranty.",
      "Lifetime warranty — if it ever breaks, we replace it for free.",
      "90 days on parts and labor, same as everybody.",
    ],
    correct: 1,
    why: "Гарантия ровно 30 дней и только на ключи, которые сделали мы, и замки, которые поставили мы. Чужую фурнитуру, поломку по вине клиента и износ она не покрывает.",
  },
  {
    id: "discount-web-form",
    q: "Клиент звонит по телефону, заявку через сайт он не отправлял: «Can you do any better on the price? I think I saw a discount on your website.»",
    options: [
      "Sure — I'll take $20 off for you right now.",
      "Let me see what I can do… how about 10% off?",
      "Yes, the website deal is 20% off — I'll just apply it to your order right now, so you don't need to fill anything out online. Just mention it to the tech when he gets there.",
      "The price is the same for everyone, and you only pay after it's done. The $20 off is for requests sent through the online form at trustkeyaz.com.",
    ],
    correct: 3,
    why: "Менеджер скидок не даёт и цену не двигает. Скидка с сайта — $20 (долларов, не процентов) и только за заявку через онлайн-форму на trustkeyaz.com.",
  },
  {
    id: "competitor-39",
    q: "Клиент заперт снаружи машины: «Another company just quoted me $39. Why would I pay you more?»",
    options: [
      "I can't speak for other companies — what I can tell you is our price is the total: the trip and the work, nothing added at the door.",
      "Those $39 guys are scammers — they quote you low on the phone and then charge you triple once they show up. With us you won't get any of that nonsense.",
      "Okay, let me see if I can match that for you.",
      "Because we're the best locksmith in the Valley.",
    ],
    correct: 0,
    why: "Конкурентов не ругаем, цену не подгоняем и себя не хвалим. Говорим о своём стандарте: наша цена итоговая — выезд и работа, на месте ничего не добавится.",
  },
  {
    id: "eta-from-crm",
    q: "Клиент заперт снаружи дома: «How long until someone gets here?» В CRM вы ещё не смотрели, кто из техников ближе. Что делать?",
    options: [
      "Сказать «About 15 minutes» — так клиент не уйдёт к конкурентам.",
      "Назвать среднее время по компании: «Usually about 20 minutes».",
      "Посмотреть в CRM, кто ближе, и назвать время оттуда окном — например, «about 25 to 35 minutes».",
      "Не называть время, чтобы не ошибиться: сказать, что точное время сообщит сам техник, когда выедет, и сразу перейти к адресу.",
    ],
    correct: 2,
    why: "Время приезда — только реальное, из CRM, и окном. «15 минут» наугад или «среднее время» — неправда, которая вернётся злым клиентом и плохим отзывом.",
  },
  {
    id: "call-911-smoke",
    q: "Клиентка заперта снаружи квартиры: «I'm locked out, and I left a pan on the stove — I can smell smoke!»",
    options: [
      "Don't worry — I'll send the closest tech right away, he'll get you inside in no time. What's the exact address?",
      "Please hang up and call 911 right now — they'll get there fastest. Then call me back.",
      "Is it the deadbolt that's locked, or just the handle?",
      "Our tech can be there in 15 minutes — hang tight.",
    ],
    correct: 1,
    why: "Плита, дым, человеку плохо, ребёнок или животное заперты — это к 911: они приедут быстрее всех. Сначала 911, потом мы, а скрипт и заявка подождут.",
  },
  {
    id: "car-key-documents",
    q: "Клиенту нужен запасной ключ к машине: «Do I really need the registration? It's my car, I just can't find the paperwork.»",
    options: [
      "Please have your ID and the registration or title ready — we check that before making any car key. That's how we make sure keys only go to the owner.",
      "No problem — the tech can make it anyway. I'll leave him a note that you're the owner, and you can just show him the paperwork later, once you find it at home.",
      "Just show him a photo of the car on your phone — that's enough.",
      "For a spare key we don't need documents — only for lockouts.",
    ],
    correct: 0,
    why: "Без ID и регистрации (или title) ключ к машине не делаем — ни запасной, ни новый. Это защищает самого клиента: ключи получает только владелец машины.",
  },
  {
    id: "own-fob",
    q: "Клиент: «I bought a key fob on Amazon for my Honda. Can you just program it for me?»",
    options: [
      "Sure — as long as it's for a Honda, we can program it.",
      "Amazon fobs are junk — honestly, you wasted your money.",
      "We don't program fobs bought online — a lot of them are the wrong part or frequency, and used ones are often locked to the first car. People end up paying twice. We bring a proper key and program it fully.",
      "We can try — if it doesn't program, you'll only pay the $59 service call, and the tech will bring one of ours as a backup just in case. Either way, you'll drive away with a working key today, no stress at all.",
    ],
    correct: 2,
    why: "Купленные клиентом брелоки не программируем: часто не та деталь или частота, а б/у уже прописаны в другую машину. Говорим без упрёков и предлагаем свой ключ по цене этого типа ключа.",
  },
  {
    id: "european-dealer-only",
    q: "Клиент: «I need a spare key for my 2021 Audi Q5. How soon can you get here?»",
    options: [
      "Sure, we do all makes and models, including BMW, Mercedes and Audi — I'll send a tech right now, and he can be there in about 15 minutes to make your spare key right in your driveway.",
      "We don't work on European cars — you'll have to go to the dealer.",
      "We're about 30% cheaper than the dealer, so you're better off with us.",
      "Late-model BMW, Mercedes and Audi keys are often dealer-only — let me check yours by year and model before we send anyone, so you don't pay for a trip for nothing.",
    ],
    correct: 3,
    why: "Свежие Audi, BMW и Mercedes часто делает только дилер, поэтому сначала проверяем машину — панель ключей в CRM пометит «Dealer / bench» — и только потом отправляем техника. Вслепую не обещаем, но и не отказываем, не проверив.",
  },
  {
    id: "car-key-exact-price",
    q: "Клиенту нужен запасной ключ к машине с кнопкой Start. Он настаивает: «Just give me the exact price. How much is it going to be?»",
    options: [
      "It'll be exactly [price] — guaranteed, the price won't change.",
      "A smart key for your car starts from [price] — key, cutting and programming, done at your car. The tech confirms the exact price before any work starts, and the $59 service call is credited toward the job.",
      "It really depends on the car and the type of key, so I can't say on the phone. The tech will look at your car, figure out which key you need and tell you the price when he gets there — that way it's fair for everybody.",
      "Probably somewhere around two or three hundred, I think.",
    ],
    correct: 1,
    why: "Точную цену автоключа по телефону не даём: называем честное «from», точную цену техник подтверждает до начала работы, а $59 за выезд засчитываются в работу. Уходить от ответа («it depends») тоже нельзя — для локсмита это признак мошенника.",
  },
  {
    id: "landlord-tenant",
    q: "Звонит хозяин квартиры: «My tenant hasn't paid rent in two months. I need you to open the unit and change the lock today.»",
    options: [
      "No problem — you own the place, so you have every right. What's the address?",
      "Sure — just have the lease and your ID ready for the tech.",
      "We can open it for you, but changing the lock is up to you.",
      "I'm sorry, we can't help with that one.",
    ],
    correct: 3,
    why: "Отказываем: в Аризоне закон защищает жильцов от самовольного выселения, и мы в этом не участвуем. Отказываем вежливо и без споров.",
  },
  {
    id: "install-over-1000",
    q: "Клиент хочет новые смарт-замки с установкой на все 6 дверей дома — по прайсу выходит больше $1,000. Он спрашивает, когда вы сможете приехать. Что делать?",
    options: [
      "Записать как обычно на ближайший свободный день — чем больше заказ, тем лучше для компании, а детали техник обсудит на месте.",
      "Разбить работу на два визита, чтобы каждый счёт был меньше $1,000.",
      "Не записывать самому: взять имя, телефон, что нужно и сколько дверей — и передать владельцу, такие проекты ведёт он.",
      "Сказать, что установкой замков мы не занимаемся.",
    ],
    correct: 2,
    why: "Мы не лицензированный подрядчик: установочный проект должен стоить меньше $1,000 всего (работа + материалы), а дробить его на части закон запрещает. Всё, что крупнее, а также panic bars — только через владельца.",
  },
  {
    id: "shop-location",
    q: "Клиент: «Where's your shop? Can I just drive over and get a key made there?»",
    options: [
      "Sure — our shop is in Mesa. I'll text you the address, and you can come by anytime today — we'll cut the key while you wait.",
      "We're based in Mesa and fully mobile — no storefront. The tech comes to you in a marked vehicle.",
      "We have locations all over the Valley — just pick the closest one.",
      "I can text you the owner's home address — you can pick up the key there.",
    ],
    correct: 1,
    why: "Мастерской и офиса для клиентов нет: мы выездные, база в Mesa, техник приезжает на машине с логотипами TrustKey. Личные адреса и телефоны владельцев не называем никогда.",
  },
  {
    id: "unknown-answer",
    q: "Клиент спрашивает то, чего нет ни в скрипте, ни в базе знаний: «Will my car insurance cover this? Can you bill them directly?»",
    options: [
      "Good question — let me check that and call you right back in a few minutes.",
      "Yes, we bill all the major insurance companies directly — just give the tech your policy number when he gets there.",
      "No, insurance never covers locksmiths.",
      "Hmm… I don't know.",
    ],
    correct: 0,
    why: "Не знаешь ответа — не выдумывай ни «да», ни «нет»: одна выдуманная фраза может стоить компании профиля в Google. Пообещай уточнить, узнай ответ и обязательно перезвони.",
  },
];

export const ROLE_PLAYS: RolePlay[] = [
  {
    id: "dog-in-hot-car",
    title: "Собака в закрытой машине",
    script: "car-lockout",
    caller: "Вы — женщина лет 35, днём на раскалённой парковке у Walmart в Mesa. Ключи остались в машине, двигатель заглушен, вы нервничаете и говорите быстро. В машине ваша собака. Скажите об этом, как только менеджер спросит, есть ли кто-то внутри; если за первые 2–3 реплики он не спросит — скажите сами («My dog is in there!») и отметьте, что вопрос пропущен. Когда вас отправят звонить в 911, сначала уговаривайте менеджера приехать самому, потом согласитесь, «положите трубку» и перезвоните: 911 уже едут, но машину открыть всё равно нужно.",
    opening: "Hi, I locked my keys in my car — I'm in the Walmart parking lot and it's like a hundred and ten out here.",
    twists: [
      "My dog's in there! Can't you just send somebody right now? You're probably faster than 911.",
      "Okay, I called 911 — they're on their way. But I still need my car opened. Can you guys come?",
      "How long is your guy gonna take — like fifteen minutes?",
    ],
    mustDo: [
      "Первым делом спросить, нет ли в машине человека или животного, и на «собака внутри» сразу сказать: «Please hang up and call 911 right now — they'll get there fastest. Then call me back.»",
      "Не поддаться на уговоры: спокойно повторить, что 911 доберутся быстрее всех, и не обсуждать цену и время, пока клиентка туда не позвонила.",
      "Когда клиентка перезвонит: ключи внутри или потеряны, город и лучший номер, год и марка машины.",
      "Назвать цену из карточки скрипта одной уверенной фразой, со словом «total»: выезд и вскрытие, на месте ничего не добавится.",
      "Назвать время приезда только из CRM и окном (например, «about 25 to 35 minutes»).",
      "Взять точный адрес и где именно стоит машина; попросить приготовить ID и регистрацию; сказать, что оплата после работы.",
      "Повторить заявку: имя, адрес, car lockout, цена, техник и окно — и предупредить о СМС с именем и фото техника.",
    ],
    traps: [
      "Сначала назвать цену или время приезда и только потом (или вообще не) сказать про 911.",
      "Пообещать приехать быстрее 911 или отговаривать туда звонить.",
      "Назвать «15 minutes» наугад, не посмотрев в CRM.",
    ],
  },
  {
    id: "home-lockout-price-first",
    title: "Дом: цену спросили первой фразой",
    script: "home-lockout",
    caller: "Вы — мужчина, днём вышли вынести мусор, и дверь дома в Chandler захлопнулась. Ключи, кошелёк и ID внутри, телефон при вас. Внутри никого нет, плита выключена. Вы обзваниваете несколько компаний и цену спрашиваете сразу. Если менеджер уходит от ответа («it depends», «the tech will tell you»), скажите «Okay, I'll call someone else» и закончите звонок — это провал.",
    opening: "Hi, how much do you charge to unlock a house door?",
    twists: [
      "Is that the final price, or are there gonna be extra fees when he shows up?",
      "My wallet and my ID are inside the house — is that a problem?",
      "You're not gonna drill my lock, are you?",
    ],
    mustDo: [
      "Ответить на цену сразу: цена из карточки скрипта, одной фразой, «total» — выезд и работа, на месте ничего не добавится; и тут же задать следующий вопрос.",
      "Спросить, нет ли внутри того, кому нужна помощь: ребёнок один, человеку плохо, включена плита.",
      "Уточнить город и лучший номер; какой замок закрыт — засов или ручка.",
      "Назвать время приезда из CRM окном; взять точный адрес, код ворот или номер квартиры.",
      "На «ID внутри» спокойно сказать, что техник проверит его сразу после вскрытия; оплата — когда клиент уже внутри.",
      "На вопрос про сверление: всегда начинаем без разрушений, а если замок придётся сверлить, техник скажет об этом до начала работы.",
      "Повторить заявку: имя, адрес, home lockout, цена, техник и окно, СМС с именем и фото техника.",
    ],
    traps: [
      "Уйти от цены: «it depends», «the tech will tell you», «probably around…».",
      "Пообещать «we never drill» или «если не откроем — бесплатно».",
      "Предлагать rekey, хотя ключи не потеряны, а просто заперты внутри.",
    ],
  },
  {
    id: "car-lockout-39-quote",
    title: "Машина: «мне сказали $39»",
    script: "car-lockout",
    caller: "Вы — студентка, днём у кампуса ASU в Tempe. Машина закрыта, ключи лежат на сиденье, внутри никого. Вы уже звонили в другую компанию: там сказали «$39», а что входит в цену — не объяснили. Торгуйтесь, но если менеджер спокойно объяснит, что его цена итоговая и платить нужно только после работы, — соглашайтесь. Регистрация лежит в бардачке.",
    opening: "Hey, I locked my keys in my car. How much to get it open?",
    twists: [
      "Another company quoted me thirty-nine bucks. Why are you so much more?",
      "Can you do it any cheaper? I'm a student.",
      "My registration's in the glove box — is that okay?",
    ],
    mustDo: [
      "Спросить, нет ли в машине человека или животного; уточнить, ключи внутри или потеряны.",
      "Уточнить город и лучший номер, год и марку машины.",
      "Назвать цену из карточки скрипта одной фразой, со словом «total»: выезд и вскрытие, на месте ничего не добавится.",
      "На «$39» ответить «I can't speak for other companies…» и говорить только о своей цене: она итоговая.",
      "На «cheaper» — цена одна для всех, а платить только после работы; не торговаться.",
      "Назвать время из CRM окном; взять точный адрес и где стоит машина; ID и регистрация — если она в машине, техник проверит сразу после вскрытия.",
      "Повторить заявку и предупредить о СМС с именем и фото техника.",
    ],
    traps: [
      "Ругать конкурентов: «those $39 guys are scammers», «they'll rip you off».",
      "Дать скидку или пообещать «посмотреть, что можно сделать» с ценой.",
      "Хвалить себя вместо фактов: «we're the best», «#1 in town».",
    ],
  },
  {
    id: "camry-spare-smart-key",
    title: "Запасной смарт-ключ, Camry 2018",
    script: "car-key",
    caller: "Вы — мужчина, у вас Toyota Camry 2018 с кнопкой Start и один рабочий смарт-ключ. Нужен запасной, не срочно: удобно завтра утром, машина будет у дома в Gilbert. Права и регистрация на ваше имя. Год и модель называйте, только когда спросят. Вы хотите точную цену и не понимаете, за что платить $59.",
    opening: "Hi, I need a spare key for my car. I've only got the one.",
    twists: [
      "Can you just give me the exact price? I don't like surprises.",
      "So what's the fifty-nine dollars for — is that on top of everything?",
      "And what if the new key stops working after a week?",
    ],
    mustDo: [
      "Уточнить: есть ли рабочий ключ (есть — значит запасной, не All Keys Lost), год, марку и модель, кнопка Start или поворотный ключ, сколько ключей нужно.",
      "Назвать цену смарт-ключа из карточки скрипта со словом «from», одной фразой: ключ, нарезка и программирование прямо у машины.",
      "Объяснить модель: точную цену техник подтверждает до начала работы; $59 service call засчитывается в работу, а если клиент откажется — платит только $59 за выезд.",
      "На вопрос про гарантию — ровно 30 дней на ключи, которые делаем мы.",
      "Предложить выбор («today, or would you like to schedule it — morning or afternoon?»), а не «когда вам удобно?»; взять адрес, где будет машина, и лучший номер.",
      "Предупредить: нужны ID и регистрация или title — без них ключ не делаем.",
      "Повторить заявку: имя, адрес, смарт-ключ для Camry 2018, цена «starting from», подтверждение до работы, день и время.",
    ],
    traps: [
      "Назвать точную цену ключа («exactly…», «the price won't change») или уйти от ответа («it depends on the car»).",
      "Выдать $59 за доплату сверху — или не сказать о нём вовсе.",
      "Пообещать гарантию дольше 30 дней.",
      "Сказать, что для запасного ключа документы не нужны.",
    ],
  },
  {
    id: "bmw-all-keys-lost",
    title: "BMW 2021: потеряны все ключи",
    script: "akl",
    caller: "Вы — женщина, потеряли единственный ключ от BMW X3 2021 года с кнопкой Start. Машина стоит у спортзала в Scottsdale, вы расстроены и хотите, чтобы кто-то приехал прямо сейчас. Считаем, что панель ключей в CRM показывает для этой машины «Dealer / bench»: когда менеджер скажет, что проверяет, подскажите ему это как тренер. Честный ответ «лучше к дилеру» примите спокойно.",
    opening: "Hi, I lost my only car key and I'm stuck at the gym. Can someone come make me a new one?",
    twists: [
      "It's a 2021 BMW X3, push-button start. Can you just send somebody right now?",
      "Aren't you guys way cheaper than the dealer anyway?",
      "Can't your guy at least come out and try?",
    ],
    mustDo: [
      "Одной фразой посочувствовать и сразу перейти к делу («That's a tough spot…»), без дежурного «I understand».",
      "Уточнить год, марку, модель, кнопка Start или ключ; где машина и лучший номер.",
      "До цены и отправки техника честно сказать, что свежие BMW часто делает только дилер: «let me check yours before we send anyone, so you don't pay for a trip for nothing».",
      "Проверить машину в панели ключей CRM.",
      "Увидев «Dealer / bench», честно направить к дилеру и оставить дверь открытой: «If you ever need a lockout or a key for another car, we're here.»",
      "Если клиент не записался — закрыть New Job крестиком и выбрать причину «Дилерская машина».",
    ],
    traps: [
      "Пообещать «Sure, we can do your BMW» или отправить техника, не проверив машину.",
      "Сравнивать с дилером в процентах или хвалиться ценой: «we're 30% cheaper», «cheapest in town».",
      "Отправить техника «просто попробовать», когда проверка уже показала «Dealer / bench», — клиентка заплатит за выезд впустую.",
    ],
  },
  {
    id: "amazon-fob",
    title: "Брелок с Amazon: «пропишите»",
    script: "car-key",
    caller: "Вы — мужчина, у вас Ford F-150 2017 года: ключ поворотный, брелок отдельно. Рабочий ключ есть, а брелок потерялся, и вы купили новый на Amazon за $25. Хотите, чтобы его просто «прописали». Сначала настаивайте и слегка обижайтесь. Если менеджер без упрёков объяснит, почему так бывает, спросите, сколько стоит их брелок, и соглашайтесь на завтра. Пикап стоит у дома в Queen Creek.",
    opening: "Hey, I bought a key fob on Amazon for my truck. Can you guys program it for me?",
    twists: [
      "But it says right on the listing it fits a 2017 F-150. It's brand new.",
      "So I just wasted twenty-five bucks?",
      "Okay, so how much is yours?",
    ],
    mustDo: [
      "Вежливо, но твёрдо сказать, что брелоки, купленные онлайн, мы не программируем, и объяснить почему: часто не та деталь или частота, б/у уже прописаны в другую машину — люди платят дважды.",
      "Предложить привезти свой ключ и прописать его полностью.",
      "Уточнить: есть ли рабочий ключ, год, марку и модель, кнопка Start или ключ, есть ли на ключе кнопки.",
      "Назвать цену из карточки скрипта для этого типа ключа со словом «from»: точную цену техник подтверждает до начала работы, а $59 service call засчитывается в работу.",
      "Предложить выбор времени, взять адрес, где будет машина, и лучший номер.",
      "Предупредить про ID и регистрацию или title и повторить заявку.",
    ],
    traps: [
      "Согласиться «попробовать» прописать брелок клиента.",
      "Упрекать клиента: «Amazon fobs are junk», «you wasted your money».",
      "Назвать точную цену нашего брелока вместо «from».",
    ],
  },
  {
    id: "rekey-three-doors",
    title: "Rekey трёх дверей после переезда",
    script: "rekey",
    caller: "Вы — женщина, неделю назад с мужем купили дом в Gilbert и не знаете, у кого ещё остались ключи. Просите «change the locks»; слова «rekey» не знаете — если менеджер его скажет, переспросите. Дверей с ключом три: входная, задняя и из гаража в дом, все замки Kwikset. Не срочно: удобно завтра после обеда.",
    opening: "Hi, we just bought a house and I want to change all the locks. How much would that be?",
    twists: [
      "What's rekeying? Is that the same as new locks?",
      "Okay, so what would the total be for all three doors?",
      "Can we have one key that opens all of them?",
    ],
    mustDo: [
      "Спросить причину (переезд или потерянные ключи) и сколько дверей с ключевыми замками — входная, задняя, из гаража.",
      "Объяснить разницу: при rekey меняют штифты внутри цилиндра — старые ключи перестают работать, замок остаётся тот же, и это намного дешевле замены.",
      "Назвать цену по карточке скрипта (первая дверь плюс каждая следующая) и сразу посчитать вслух дневной итог за 3 двери: «… total».",
      "Предложить один ключ на все двери — это можно, раз все замки одного бренда.",
      "Предложить выбор: сегодня или завтра, утром или днём; взять адрес и лучший номер.",
      "Повторить заявку: имя, адрес, rekey 3 дверей, итоговая сумма, день и время.",
    ],
    traps: [
      "Сразу продавать новые замки, не объяснив, что rekey дешевле и решает задачу.",
      "Назвать цену только за первую дверь и не посчитать итог.",
      "Говорить неуверенно: «I think…», «probably around…».",
    ],
  },
  {
    id: "glendale-out-of-area",
    title: "Звонок из Glendale — вне зоны",
    script: "home-lockout",
    caller: "Вы — женщина, днём захлопнули дверь дома в Glendale, ключи внутри. Внутри никого нет, плита выключена. Через час вам забирать сына из школы. Тренер заранее выбирает, что «покажет CRM», и менеджеру не говорит: А — ближайший техник доедет примерно за 25–30 минут (надо брать заказ по обычному скрипту); Б — не меньше 50 минут (надо честно и вежливо отказать). Назовите выбранный вариант, когда менеджер скажет, что проверяет, кто ближе.",
    opening: "Hi, I'm locked out of my house. Do you guys come out to Glendale?",
    twists: [
      "It's kind of urgent — I have to pick up my son from school in about an hour.",
      "Can't you just charge me extra for the drive and come anyway?",
      "So how long would it actually take?",
    ],
    mustDo: [
      "Спросить, нет ли внутри того, кому нужна помощь: ребёнок один, человеку плохо, включена плита.",
      "Уточнить город и лучший номер; услышав город не из нашего списка, спросить, насколько срочно: «How urgent is it?»",
      "Проверить в CRM, за сколько доедет ближайший техник: в пределах ~30 минут — берём, дольше — отказываем.",
      "Вариант А: цена из карточки скрипта одной фразой, «total»; окно из CRM; точный адрес, код ворот или номер квартиры; ID; повтор заявки.",
      "Вариант Б: «I'm sorry, that's outside the area we can reach quickly. I'd rather tell you now than keep you waiting.» — и при закрытии New Job выбрать причину «Вне зоны».",
    ],
    traps: [
      "Пообещать приехать, не проверив в CRM, кто ближе и за сколько доедет.",
      "Придумать доплату за дальность или любую цену, которой нет в карточке скрипта.",
      "Сказать «about 30 minutes», чтобы не потерять клиента, когда CRM показывает больше.",
    ],
  },
  {
    id: "commercial-panic-bars-master-key",
    title: "Офис: panic bars и мастер-ключ",
    script: "commercial",
    caller: "Вы — офис-менеджер небольшой клиники в Tempe: не владелец, но за здание отвечаете вы. Нужны panic bars на две запасные двери (пожарный инспектор сделал замечание) и мастер-ключ на 12 дверей, чтобы у каждого сотрудника был ключ только от своих. Хотите цену прямо сейчас и начать на этой неделе. Вы вежливы, но настойчивы.",
    opening: "Hi, I manage a medical office in Tempe. We need panic bars on two exit doors and a master key system for about twelve doors.",
    twists: [
      "Can you just give me a ballpark for the whole thing?",
      "Can your guy start on it this week?",
      "Can't you at least do the panic bars? It's only two doors.",
      "Are you licensed for this kind of work?",
    ],
    mustDo: [
      "Спросить, кто звонит — владелец или менеджер бизнеса.",
      "Не записывать проект самому: «For a project like this, the owner calls you back personally to set up a walkthrough and a written estimate.»",
      "Записать имя, лучший номер, город, что нужно (panic bars на 2 двери и мастер-ключ) и сколько дверей (12).",
      "Спросить, когда владельцу удобнее перезвонить: «What's the best time to reach you?»",
      "На «licensed?» — только правда: в Аризоне нет лицензии локсмита, мы зарегистрированная компания со страховкой, а лицензии подрядчика (ROC) у нас нет.",
      "Сразу после звонка передать всё владельцу.",
    ],
    traps: [
      "Записать проект в расписание самому или пообещать начать на этой неделе.",
      "Согласиться поставить panic bars «хотя бы на две двери»: без лицензии подрядчика это запрещено при любой цене.",
      "Прикинуть цену проекта по телефону — её даёт владелец письменной сметой после осмотра.",
      "Разбить проект на части, чтобы каждая была меньше $1,000.",
    ],
  },
  {
    id: "broken-key-front-door",
    title: "Ключ сломался во входной двери",
    script: "broken-key",
    caller: "Вы — пожилой осторожный мужчина. Ключ сломался в замке входной двери вашего дома в Mesa, обломок застрял внутри. Вы снаружи, задняя дверь тоже заперта, сейчас день. Вы боитесь мошенников, поэтому, прежде чем дать адрес, спрашиваете, сколько компания работает и есть ли у неё bond. Если ответы честные и спокойные — соглашаетесь.",
    opening: "Hi there. My key just snapped off in my front door lock, and half of it's still stuck in there.",
    twists: [
      "Before I give you my address — how long have you folks been in business?",
      "Are you bonded?",
      "And if I need a new key after that, how much more is that gonna cost me?",
    ],
    mustDo: [
      "Уточнить, где сломался ключ и может ли клиент попасть в дом: заперт снаружи — значит, заказ срочный (Emergency).",
      "Спросить город и лучший номер.",
      "Назвать цену извлечения из карточки скрипта одной фразой; новый ключ — отдельно, его цену техник назовёт до того, как делать ключ.",
      "На «how long?» — только правда: «We're a new local company — TrustKey opened in June 2026…», плюс цена до начала работы и 30 дней гарантии.",
      "На «bonded?» — честно: «No, we're not bonded. We're a registered Arizona company and we carry liability insurance — and you only pay after the job is done.»",
      "Назвать время из CRM окном; взять точный адрес и какая дверь; попросить приготовить ID; оплата после работы.",
      "Повторить заявку: имя, адрес, извлечение сломанного ключа, цена, техник и окно, СМС с именем и фото техника.",
    ],
    traps: [
      "Сказать «yes, we're bonded» или «licensed and bonded».",
      "Прибавить компании возраст: «since 2010», «about a year», «15 years of experience».",
      "Пообещать, что новый ключ входит в цену извлечения, или назвать его цену наугад.",
    ],
  },
];
