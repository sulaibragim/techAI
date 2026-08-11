import type { Role, TabId } from './types';

/**
 * Guided-tour content, in English and Russian. Everything the onboarding shows lives here
 * so copy changes never touch the overlay engine, and both languages stay next to each
 * other so one can't drift out of sync with the other.
 *
 * A step either spotlights a real element (`target`) or shows a centered card. Targets are
 * CSS selectors — `data-tour` attributes placed in the components. The engine tolerates a
 * missing target (the element may be hidden on this screen size, or the role may not have
 * it) by falling back to a centered card, so a tour can never dead-end on a null ref.
 */
export type Lang = 'en' | 'ru';

export interface Localized {
  en: string;
  ru: string;
}

/** Reads the requested language, falling back to English if it's ever missing. */
export const localize = (x: Localized, lang: Lang): string => x[lang] || x.en;

/** Russian noun plural form for a count (1 → one, 2–4 → few, else → many). */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

export interface TourStep {
  /** CSS selector for the element to spotlight. Omit for a centered card. */
  target?: string;
  title: Localized;
  body: Localized;
  /** Switch to this tab before showing the step. */
  tab?: TabId;
  /** Where the tooltip sits relative to the target. 'auto' picks whichever side fits. */
  placement?: 'auto' | 'top' | 'bottom' | 'center';
}

export interface TourDef {
  id: string;
  /** Shown in Settings → Guided tours. */
  label: Localized;
  description: Localized;
  roles: Role[];
  /** 'welcome' runs once after the first sign-in; 'tab' runs on first visit to `tab`. */
  trigger: 'welcome' | 'tab';
  tab?: TabId;
  steps: TourStep[];
}

const ALL_ROLES: Role[] = ['owner', 'manager', 'technician', 'accountant', 'warehouse'];
const OFFICE: Role[] = ['owner', 'manager'];

const WELCOME_TOUR_LABEL: Localized = { en: 'Welcome tour', ru: 'Вводный тур' };

export const TOURS: TourDef[] = [
  // ─── Welcome tours: one per role, run once after the first sign-in ──────────────
  {
    id: 'welcome-office',
    label: WELCOME_TOUR_LABEL,
    description: { en: 'The five-minute lap around the whole system', ru: 'Пятиминутный обзор всей системы' },
    roles: OFFICE,
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: { en: 'This is your Workroom', ru: 'Это ваша Мастерская' },
        body: {
          en: "Today's schedule, the money you have made this month, and anything waiting on a decision — all on one screen. Everything else is one tab away.",
          ru: 'Расписание на сегодня, выручка за этот месяц и всё, что требует решения, — на одном экране. Остальное — на соседних вкладках.',
        },
      },
      {
        target: '[data-tour="new-job"]',
        title: { en: 'Every job starts here', ru: 'Каждый заказ начинается здесь' },
        body: {
          en: 'Client, address, what is locked, who is going. Three short steps and the job is on the board.',
          ru: 'Клиент, адрес, что нужно вскрыть, кто едет. Три коротких шага — и заказ уже на доске.',
        },
        placement: 'auto',
      },
      {
        target: '[data-tour="nav-jobs"]',
        title: { en: 'Jobs is the full queue', ru: '«Заказы» — это вся очередь' },
        body: {
          en: 'Filter by status or technician, open any card to see photos, the invoice, and the whole message history with that client.',
          ru: 'Фильтруйте по статусу или технику, открывайте карточку — там фото, счёт и вся переписка с этим клиентом.',
        },
      },
      {
        target: '[data-tour="nav-messages"]',
        title: { en: 'Inbox keeps the conversation', ru: '«Входящие» хранят переписку' },
        body: {
          en: 'Texts and calls grouped by client. Reply, send an invoice, or turn a message straight into a job.',
          ru: 'СМС и звонки сгруппированы по клиенту. Отвечайте, отправляйте счёт или сразу превращайте сообщение в заказ.',
        },
      },
      {
        target: '[data-tour="nav-brain"]',
        title: { en: 'Your assistant', ru: 'Ваш ассистент' },
        body: {
          en: 'Ask it anything — "who owes me money?", "book Maria for tomorrow at 2", "what do I stock for a Ford F-150 key?". It can act, not just answer.',
          ru: 'Спросите что угодно — «кто мне должен?», «запиши Марию на завтра на 14:00», «что нужно для ключа Ford F-150?». Он не просто отвечает, а выполняет.',
        },
      },
      {
        target: '[data-tour="checklist"]',
        title: { en: 'Start here', ru: 'Начните отсюда' },
        body: {
          en: 'This short list walks you from an empty system to your first paid job. It disappears on its own once you are done.',
          ru: 'Этот короткий список проведёт вас от пустой системы до первого оплаченного заказа. Он исчезнет сам, как только вы всё сделаете.',
        },
        placement: 'auto',
      },
    ],
  },
  {
    id: 'welcome-tech',
    label: WELCOME_TOUR_LABEL,
    description: { en: 'How your day works in the app', ru: 'Как устроен ваш рабочий день в приложении' },
    roles: ['technician'],
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: { en: 'Your day, in one screen', ru: 'Ваш день — на одном экране' },
        body: {
          en: 'Only the jobs assigned to you show up here. Newest at the top, with the address and the time you are expected.',
          ru: 'Здесь только назначенные вам заказы. Новые — сверху, с адресом и временем, к которому вас ждут.',
        },
      },
      {
        target: '[data-tour="nav-jobs"]',
        title: { en: 'Open a job to work it', ru: 'Откройте заказ, чтобы начать работу' },
        body: {
          en: 'Accept it, tap On My Way so the office and the client know you are moving, add photos, then build the invoice and collect payment on the spot.',
          ru: 'Примите заказ, нажмите «Выехал», чтобы офис и клиент знали, что вы в пути, добавьте фото, затем соберите счёт и примите оплату на месте.',
        },
      },
      {
        target: '[data-tour="nav-autokey"]',
        title: { en: 'Auto-Key before you drive', ru: '«Авто-Ключ» перед выездом' },
        body: {
          en: 'Type the car or scan the VIN and it tells you the keyway, the chip, whether it needs programming — and whether that blank is on the van.',
          ru: 'Введите марку и год или отсканируйте VIN — узнаете личинку, чип, нужна ли прошивка и есть ли заготовка в фургоне.',
        },
      },
      {
        target: '[data-tour="nav-inventory"]',
        title: { en: 'Stock lives here', ru: 'Здесь живёт склад' },
        body: {
          en: 'What you used on a job comes off the shelf automatically when you add it to the invoice.',
          ru: 'То, что вы использовали на заказе, автоматически списывается со склада, когда вы добавляете это в счёт.',
        },
      },
    ],
  },
  {
    id: 'welcome-accountant',
    label: WELCOME_TOUR_LABEL,
    description: { en: 'Where the money lives', ru: 'Где хранятся деньги' },
    roles: ['accountant'],
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: { en: 'The books, first', ru: 'Сначала — бухгалтерия' },
        body: {
          en: 'You land on Accounting: revenue, expenses, what is still owed, and every payment that came through the card reader.',
          ru: 'Вы сразу попадаете в «Бухгалтерию»: выручка, расходы, непогашенные долги и все платежи через терминал.',
        },
      },
      {
        target: '[data-tour="nav-analytics"]',
        title: { en: 'Financials shows the trend', ru: '«Финансы» показывают динамику' },
        body: {
          en: 'Revenue by month, close rate, and per-technician performance — the same numbers, drawn out over time.',
          ru: 'Выручка по месяцам, конверсия в продажу и результаты каждого техника — те же цифры, но в развитии во времени.',
        },
      },
    ],
  },
  {
    id: 'welcome-warehouse',
    label: WELCOME_TOUR_LABEL,
    description: { en: 'The shelf and nothing else', ru: 'Только склад — и больше ничего' },
    roles: ['warehouse'],
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: { en: 'This screen is the shelf', ru: 'Этот экран — это склад' },
        body: {
          en: 'Receive deliveries, hand parts to technicians, run a stocktake. No clients, no money — just what is on the rack.',
          ru: 'Принимайте поставки, выдавайте детали техникам, проводите инвентаризацию. Ни клиентов, ни денег — только то, что лежит на полке.',
        },
      },
      {
        target: '[data-tour="stock-tools"]',
        title: { en: 'Receiving and handouts', ru: 'Приём и выдача' },
        body: {
          en: 'Import a supplier invoice or an Excel sheet to receive stock. Every hand-out is logged against the technician who took it.',
          ru: 'Загрузите накладную поставщика или файл Excel, чтобы оприходовать товар. Каждая выдача фиксируется за техником, который её забрал.',
        },
      },
    ],
  },

  // ─── Tab tours: two or three cards the first time someone opens a tab ───────────
  {
    id: 'tab-jobs',
    label: { en: 'Jobs', ru: 'Заказы' },
    description: { en: 'The job queue and the job card', ru: 'Очередь заказов и карточка заказа' },
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'jobs',
    steps: [
      {
        placement: 'center',
        title: { en: 'Every job, filterable', ru: 'Все заказы — с фильтрами' },
        body: {
          en: 'Search by client, phone, or job number. The status chips along the top narrow the list down to what you care about right now.',
          ru: 'Ищите по клиенту, телефону или номеру заказа. Метки статусов сверху сужают список до того, что важно прямо сейчас.',
        },
      },
      {
        placement: 'center',
        title: { en: 'The card is the whole job', ru: 'В карточке — весь заказ' },
        body: {
          en: 'Open one and you get the lock details, photos from the field, the invoice with line items, payment, and every text sent to that client.',
          ru: 'Откройте карточку — там детали замка, фото с объекта, счёт с позициями, оплата и вся переписка с клиентом.',
        },
      },
    ],
  },
  {
    id: 'tab-messages',
    label: { en: 'Inbox', ru: 'Входящие' },
    description: { en: 'Texting clients', ru: 'Переписка с клиентами' },
    roles: OFFICE,
    trigger: 'tab',
    tab: 'messages',
    steps: [
      {
        placement: 'center',
        title: { en: 'One thread per client', ru: 'Одна лента на клиента' },
        body: {
          en: 'Texts, calls, and invoices you sent them, in the order they happened — not a pile of loose messages.',
          ru: 'СМС, звонки и отправленные счета — в хронологическом порядке, а не кучей разрозненных сообщений.',
        },
      },
      {
        placement: 'center',
        title: { en: 'Templates keep texts cheap', ru: 'Шаблоны экономят на СМС' },
        body: {
          en: 'Use the templates when you can. The preview counts segments before you send, and dashes or emoji quietly turn one text into five.',
          ru: 'Используйте шаблоны, когда можете. Перед отправкой предпросмотр считает сегменты — тире или эмодзи незаметно превращают одну СМС в пять.',
        },
      },
    ],
  },
  {
    id: 'tab-calls',
    label: { en: 'Calls', ru: 'Звонки' },
    description: { en: 'Call history and transcripts', ru: 'История звонков и расшифровки' },
    roles: OFFICE,
    trigger: 'tab',
    tab: 'calls',
    steps: [
      {
        placement: 'center',
        title: { en: 'Every call that came in', ru: 'Все входящие звонки' },
        body: {
          en: 'Missed calls sit at the top. Open one to read the transcript and turn what the caller asked for into a job without retyping it.',
          ru: 'Пропущенные звонки — сверху. Откройте, прочитайте расшифровку и превратите просьбу звонившего в заказ, ничего не перепечатывая.',
        },
      },
    ],
  },
  {
    id: 'tab-clients',
    label: { en: 'Clients', ru: 'Клиенты' },
    description: { en: 'The customer base', ru: 'База клиентов' },
    roles: OFFICE,
    trigger: 'tab',
    tab: 'clients',
    steps: [
      {
        placement: 'center',
        title: { en: 'Everyone you have served', ru: 'Все, кого вы обслужили' },
        body: {
          en: 'Their history, what they paid, and any notes your team left. Repeat customers are worth more than new ones — this is where you spot them.',
          ru: 'Их история, оплаты и заметки вашей команды. Постоянные клиенты ценнее новых — здесь их видно.',
        },
      },
    ],
  },
  {
    id: 'tab-analytics',
    label: { en: 'Financials', ru: 'Финансы' },
    description: { en: 'Revenue and performance', ru: 'Выручка и показатели' },
    roles: ['owner', 'manager', 'accountant'],
    trigger: 'tab',
    tab: 'analytics',
    steps: [
      {
        placement: 'center',
        title: { en: 'Where the money came from', ru: 'Откуда пришли деньги' },
        body: {
          en: 'Revenue by month against your target, close rate, and how each technician is performing. Set the target in Settings and this screen tracks you against it.',
          ru: 'Выручка по месяцам в сравнении с целью, конверсия в продажу и результаты каждого техника. Задайте цель в настройках — этот экран будет отслеживать прогресс.',
        },
      },
    ],
  },
  {
    id: 'tab-accounting',
    label: { en: 'Accounting', ru: 'Бухгалтерия' },
    description: { en: 'Books, expenses and debtors', ru: 'Учёт, расходы и должники' },
    roles: ['owner', 'manager', 'accountant'],
    trigger: 'tab',
    tab: 'accounting',
    steps: [
      {
        placement: 'center',
        title: { en: 'Books and debtors', ru: 'Учёт и должники' },
        body: {
          en: 'Log expenses, see profit after costs, and chase what is unpaid. Overdue jobs get a reminder text automatically — this is where you watch it work.',
          ru: 'Записывайте расходы, смотрите прибыль после затрат и отслеживайте неоплаченное. Просроченным заказам автоматически уходит напоминание по СМС — здесь видно, как это работает.',
        },
      },
    ],
  },
  {
    id: 'tab-marketing',
    label: { en: 'Marketing', ru: 'Маркетинг' },
    description: { en: 'Ad spend and where leads come from', ru: 'Расходы на рекламу и источники лидов' },
    roles: OFFICE,
    trigger: 'tab',
    tab: 'marketing',
    steps: [
      {
        placement: 'center',
        title: { en: 'What your ads actually returned', ru: 'Что реально принесла реклама' },
        body: {
          en: 'Revenue traced back to the channel that brought the lead, so you can see which ads pay for themselves. It only works if the lead source gets filled in at intake.',
          ru: 'Выручка привязана к каналу, который привёл клиента, — видно, какая реклама окупается. Работает, только если источник лида указан при приёме заявки.',
        },
      },
    ],
  },
  {
    id: 'tab-autokey',
    label: { en: 'Auto-Key', ru: 'Авто-Ключ' },
    description: { en: 'Car key lookup', ru: 'Подбор автоключей' },
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'autokey',
    steps: [
      {
        placement: 'center',
        title: { en: 'Know the key before you drive', ru: 'Узнайте про ключ до выезда' },
        body: {
          en: 'Enter the make and year or scan the VIN. You get the keyway, the transponder, whether it needs programming, and whether that blank is in stock.',
          ru: 'Введите марку и год или отсканируйте VIN. Вы получите личинку, транспондер, нужна ли прошивка и есть ли заготовка на складе.',
        },
      },
    ],
  },
  {
    id: 'tab-masterkey',
    label: { en: 'Master-Key', ru: 'Мастер-Ключ' },
    description: { en: 'Pinning calculator', ru: 'Калькулятор пиновки' },
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'masterkey',
    steps: [
      {
        placement: 'center',
        title: { en: 'Pinning, worked out for you', ru: 'Пиновка — уже рассчитана' },
        body: {
          en: 'Build a building, add its doors, and it calculates the pin stacks — then cross-checks for phantom keys that would open a door they should not.',
          ru: 'Добавьте здание и его двери — система рассчитает столбики пинов, а затем проверит на «фантомные» ключи, которые могли бы открыть чужую дверь.',
        },
      },
    ],
  },
  {
    id: 'tab-inventory',
    label: { en: 'Inventory', ru: 'Склад' },
    description: { en: 'Stock, receiving and reorders', ru: 'Остатки, приход и дозаказ' },
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'inventory',
    steps: [
      {
        placement: 'center',
        title: { en: 'What is on the shelf', ru: 'Что лежит на полке' },
        body: {
          en: 'Stock only moves on a real event — a delivery received, a part used on a job, a stocktake correction. Nothing is invented, so the count you see is the count you have.',
          ru: 'Остаток меняется только по реальному событию — приход, списание на заказ, корректировка при инвентаризации. Ничего не придумывается, поэтому цифра на экране — это то, что есть на самом деле.',
        },
      },
      {
        placement: 'center',
        title: { en: 'Receiving is the fast part', ru: 'Приход — это быстро' },
        body: {
          en: 'Drop in a supplier invoice or an Excel sheet and it reads the lines for you. Low stock shows up on the reorder list on its own.',
          ru: 'Загрузите накладную поставщика или файл Excel — система сама распознает строки. Заканчивающиеся позиции сами попадут в список на дозаказ.',
        },
      },
    ],
  },
  {
    id: 'tab-brain',
    label: { en: 'Assistant', ru: 'Ассистент' },
    description: { en: 'What the assistant can do', ru: 'Что умеет ассистент' },
    roles: OFFICE,
    trigger: 'tab',
    tab: 'brain',
    steps: [
      {
        placement: 'center',
        title: { en: 'It does things, not just talk', ru: 'Он действует, а не просто отвечает' },
        body: {
          en: 'Ask it to book a job, text a client, send a payment link, or tell you who owes money — it carries the action out and shows you what it did.',
          ru: 'Попросите записать заказ, написать клиенту, отправить ссылку на оплату или сказать, кто должен денег, — он выполнит и покажет результат.',
        },
      },
      {
        placement: 'center',
        title: { en: 'It remembers what you tell it', ru: 'Он запоминает, что вы говорите' },
        body: {
          en: 'Say "we do not do safes" or "Maria handles all commercial work" once, and it holds on to that. Manage what it remembers in Settings.',
          ru: 'Скажите один раз «мы не вскрываем сейфы» или «Мария ведёт всю коммерцию» — и он это запомнит. Управлять памятью можно в настройках.',
        },
      },
    ],
  },
  {
    id: 'tab-settings',
    label: { en: 'Settings', ru: 'Настройки' },
    description: { en: 'Company, team and switches', ru: 'Компания, команда и переключатели' },
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'settings',
    steps: [
      {
        placement: 'center',
        title: { en: 'Set it up once', ru: 'Настройте один раз' },
        body: {
          en: 'Company details print on every invoice. Team, revenue targets, automatic client texts, and payments all live here.',
          ru: 'Данные компании печатаются на каждом счёте. Здесь же — команда, цели по выручке, автоматические СМС клиентам и оплаты.',
        },
      },
    ],
  },
];

export const tourById = (id: string): TourDef | undefined => TOURS.find((t) => t.id === id);

export const toursForRole = (role: Role): TourDef[] => TOURS.filter((t) => t.roles.includes(role));

export const welcomeTourFor = (role: Role): TourDef | undefined =>
  TOURS.find((t) => t.trigger === 'welcome' && t.roles.includes(role));

export const tabTourFor = (role: Role, tab: string): TourDef | undefined =>
  TOURS.find((t) => t.trigger === 'tab' && t.tab === tab && t.roles.includes(role));

// ─── Onboarding chrome: everything around the tours that isn't a step ─────────────────
// The welcome card, the tour overlay's buttons, the checklist, and the Settings card all
// pull their text from here too, so a language switch changes every onboarding surface at
// once rather than leaving some screens English and others Russian.

export const UI_TEXT = {
  // Tour overlay chrome
  tourDialogLabel: { en: 'Guided tour', ru: 'Обучающий тур' } as Localized,
  closeTour: { en: 'Close the tour', ru: 'Закрыть тур' } as Localized,
  stepOf: (i: number, n: number): Localized => ({ en: `Step ${i} of ${n}`, ru: `Шаг ${i} из ${n}` }),
  skipTour: { en: 'Skip tour', ru: 'Пропустить тур' } as Localized,
  back: { en: 'Back', ru: 'Назад' } as Localized,
  next: { en: 'Next', ru: 'Далее' } as Localized,
  gotIt: { en: 'Got it', ru: 'Понятно' } as Localized,

  // Welcome card
  welcomeHeading: (name?: string): Localized => ({
    en: `Welcome${name ? `, ${name}` : ''}`,
    ru: `Добро пожаловать${name ? `, ${name}` : ''}`,
  }),
  welcomeBody: {
    en: 'Two minutes now saves you an afternoon of poking around. Pick how you would like to learn it — you can start the tour again any time from Settings.',
    ru: 'Две минуты сейчас сэкономят вам полдня блуждания по системе. Выберите, как удобнее знакомиться, — тур всегда можно запустить заново в настройках.',
  } as Localized,
  showMeAround: { en: 'Show me around', ru: 'Покажите мне всё' } as Localized,
  quickStops: (n: number): Localized => ({
    en: `${n} quick stops`,
    ru: `${n} ${ruPlural(n, 'быстрый шаг', 'быстрых шага', 'быстрых шагов')}`,
  }),
  askInstead: { en: 'I would rather just ask', ru: 'Лучше я просто спрошу' } as Localized,
  askInsteadHint: { en: 'Open the assistant and ask it anything', ru: 'Открыть ассистента и спросить что угодно' } as Localized,
  figureItOut: { en: 'I will figure it out', ru: 'Разберусь сам' } as Localized,
  closeWelcome: { en: 'Close', ru: 'Закрыть' } as Localized,

  // First-steps checklist
  checklistTitle: { en: 'First steps', ru: 'Первые шаги' } as Localized,
  checklistDoneTitle: { en: 'You are fully set up', ru: 'Всё настроено' } as Localized,
  checklistDoneSubtitle: {
    en: 'Everything below is done — this card can go now',
    ru: 'Всё внизу выполнено — эту карточку можно скрыть',
  } as Localized,
  checklistProgress: (done: number, total: number): Localized => ({
    en: `${done} of ${total} done`,
    ru: `${done} из ${total} готово`,
  }),
  hideChecklist: { en: 'Hide the checklist', ru: 'Скрыть чек-лист' } as Localized,
  hideThis: { en: 'Hide this', ru: 'Скрыть' } as Localized,

  // Settings → Guided Tours card
  guidedToursTitle: { en: 'Guided Tours', ru: 'Обучающие туры' } as Localized,
  guidedToursDescription: {
    en: 'Short walkthroughs that run on their own the first time you open a screen. Replay any of them here — handy when a new person joins and needs to be shown around.',
    ru: 'Короткие подсказки, которые сами всплывают при первом заходе на экран. Здесь их можно запустить заново — удобно, когда в команду приходит новый человек.',
  } as Localized,
  languageLabel: { en: 'Language', ru: 'Язык' } as Localized,
  replay: { en: 'Replay', ru: 'Повторить' } as Localized,
  start: { en: 'Start', ru: 'Начать' } as Localized,
  showChecklistAgain: {
    en: 'Show the first-steps checklist again',
    ru: 'Показать чек-лист первых шагов снова',
  } as Localized,
  restartOnboarding: { en: 'Start onboarding over', ru: 'Начать обучение заново' } as Localized,
  restartDescription: {
    en: 'Brings back the welcome screen, every tour, and the "not opened yet" markers on the tabs — as if you were signing in for the first time. It touches nothing but your own onboarding: no job, client, setting, or teammate is affected.',
    ru: 'Вернёт приветственный экран, все туры и метки «ещё не открыто» на вкладках — как будто вы заходите впервые. Это касается только вашего обучения: ни один заказ, клиент, настройка или сотрудник не пострадают.',
  } as Localized,
};

/** Text for each first-steps checklist item, keyed by the item id in OnboardingChecklist. */
export const CHECKLIST_ITEMS: Record<string, { label: Localized; hint: Localized }> = {
  company: {
    label: { en: 'Add your company details', ru: 'Укажите данные компании' },
    hint: { en: 'They print on every invoice you send', ru: 'Они печатаются на каждом отправленном счёте' },
  },
  team: {
    label: { en: 'Add your team', ru: 'Добавьте команду' },
    hint: { en: 'Each technician gets their own sign-in', ru: 'У каждого техника — свой вход в систему' },
  },
  job: {
    label: { en: 'Create your first job', ru: 'Создайте первый заказ' },
    hint: { en: 'Client, address, what is locked — three steps', ru: 'Клиент, адрес, что вскрыть — три шага' },
  },
  complete: {
    label: { en: 'Complete a job', ru: 'Закройте заказ' },
    hint: { en: 'Move it through to Completed on the board', ru: 'Переведите его в статус «Завершён» на доске' },
  },
  paid: {
    label: { en: 'Take your first payment', ru: 'Примите первую оплату' },
    hint: { en: 'Card, cash, or a payment link by text', ru: 'Картой, наличными или ссылкой на оплату по СМС' },
  },
};
