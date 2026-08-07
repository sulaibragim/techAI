import type { Role, TabId } from './types';

/**
 * Guided-tour content. Everything the onboarding shows lives here so copy changes never
 * touch the overlay engine.
 *
 * A step either spotlights a real element (`target`) or shows a centered card. Targets are
 * CSS selectors — `data-tour` attributes placed in the components. The engine tolerates a
 * missing target (the element may be hidden on this screen size, or the role may not have
 * it) by falling back to a centered card, so a tour can never dead-end on a null ref.
 */
export interface TourStep {
  /** CSS selector for the element to spotlight. Omit for a centered card. */
  target?: string;
  title: string;
  body: string;
  /** Switch to this tab before showing the step. */
  tab?: TabId;
  /** Where the tooltip sits relative to the target. 'auto' picks whichever side fits. */
  placement?: 'auto' | 'top' | 'bottom' | 'center';
}

export interface TourDef {
  id: string;
  /** Shown in Settings → Guided tours. */
  label: string;
  description: string;
  roles: Role[];
  /** 'welcome' runs once after the first sign-in; 'tab' runs on first visit to `tab`. */
  trigger: 'welcome' | 'tab';
  tab?: TabId;
  steps: TourStep[];
}

const ALL_ROLES: Role[] = ['owner', 'manager', 'technician', 'accountant', 'warehouse'];
const OFFICE: Role[] = ['owner', 'manager'];

export const TOURS: TourDef[] = [
  // ─── Welcome tours: one per role, run once after the first sign-in ──────────────
  {
    id: 'welcome-office',
    label: 'Welcome tour',
    description: 'The five-minute lap around the whole system',
    roles: OFFICE,
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: 'This is your Workroom',
        body: 'Today’s schedule, the money you have made this month, and anything waiting on a decision — all on one screen. Everything else is one tab away.',
      },
      {
        target: '[data-tour="new-job"]',
        title: 'Every job starts here',
        body: 'Client, address, what is locked, who is going. Three short steps and the job is on the board.',
        placement: 'auto',
      },
      {
        target: '[data-tour="nav-jobs"]',
        title: 'Jobs is the full queue',
        body: 'Filter by status or technician, open any card to see photos, the invoice, and the whole message history with that client.',
      },
      {
        target: '[data-tour="nav-messages"]',
        title: 'Inbox keeps the conversation',
        body: 'Texts and calls grouped by client. Reply, send an invoice, or turn a message straight into a job.',
      },
      {
        target: '[data-tour="nav-brain"]',
        title: 'Your assistant',
        body: 'Ask it anything — “who owes me money?”, “book Maria for tomorrow at 2”, “what do I stock for a Ford F-150 key?”. It can act, not just answer.',
      },
      {
        target: '[data-tour="checklist"]',
        title: 'Start here',
        body: 'This short list walks you from an empty system to your first paid job. It disappears on its own once you are done.',
        placement: 'auto',
      },
    ],
  },
  {
    id: 'welcome-tech',
    label: 'Welcome tour',
    description: 'How your day works in the app',
    roles: ['technician'],
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: 'Your day, in one screen',
        body: 'Only the jobs assigned to you show up here. Newest at the top, with the address and the time you are expected.',
      },
      {
        target: '[data-tour="nav-jobs"]',
        title: 'Open a job to work it',
        body: 'Accept it, tap En route so the office and the client know you are moving, add photos, then build the invoice and collect payment on the spot.',
      },
      {
        target: '[data-tour="nav-autokey"]',
        title: 'Auto-Key before you drive',
        body: 'Type the car or scan the VIN and it tells you the keyway, the chip, whether it needs programming — and if that blank is on the van.',
      },
      {
        target: '[data-tour="nav-inventory"]',
        title: 'Stock lives here',
        body: 'What you used on a job comes off the shelf automatically when you add it to the invoice.',
      },
    ],
  },
  {
    id: 'welcome-accountant',
    label: 'Welcome tour',
    description: 'Where the money lives',
    roles: ['accountant'],
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: 'The books, first',
        body: 'You land on Accounting: revenue, expenses, what is still owed, and every payment that came through the card reader.',
      },
      {
        target: '[data-tour="nav-analytics"]',
        title: 'Financials shows the trend',
        body: 'Revenue by month, close rate, and per-technician performance — the same numbers, drawn out over time.',
      },
    ],
  },
  {
    id: 'welcome-warehouse',
    label: 'Welcome tour',
    description: 'The shelf and nothing else',
    roles: ['warehouse'],
    trigger: 'welcome',
    steps: [
      {
        placement: 'center',
        title: 'This screen is the shelf',
        body: 'Receive deliveries, hand parts to technicians, run a stocktake. No clients, no money — just what is on the rack.',
      },
      {
        target: '[data-tour="stock-tools"]',
        title: 'Receiving and handouts',
        body: 'Import a supplier invoice or an Excel sheet to receive stock. Every hand-out is logged against the technician who took it.',
      },
    ],
  },

  // ─── Tab tours: two or three cards the first time someone opens a tab ───────────
  {
    id: 'tab-jobs',
    label: 'Jobs',
    description: 'The job queue and the job card',
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'jobs',
    steps: [
      {
        placement: 'center',
        title: 'Every job, filterable',
        body: 'Search by client, phone, or job number. The status chips along the top narrow the list down to what you care about right now.',
      },
      {
        placement: 'center',
        title: 'The card is the whole job',
        body: 'Open one and you get the lock details, photos from the field, the invoice with line items, payment, and every text sent to that client.',
      },
    ],
  },
  {
    id: 'tab-messages',
    label: 'Inbox',
    description: 'Texting clients',
    roles: OFFICE,
    trigger: 'tab',
    tab: 'messages',
    steps: [
      {
        placement: 'center',
        title: 'One thread per client',
        body: 'Texts, calls, and invoices you sent them, in the order they happened — not a pile of loose messages.',
      },
      {
        placement: 'center',
        title: 'Templates keep texts cheap',
        body: 'Use the templates when you can. The preview counts segments before you send, and dashes or emoji quietly turn one text into five.',
      },
    ],
  },
  {
    id: 'tab-calls',
    label: 'Calls',
    description: 'Call history and transcripts',
    roles: OFFICE,
    trigger: 'tab',
    tab: 'calls',
    steps: [
      {
        placement: 'center',
        title: 'Every call that came in',
        body: 'Missed calls sit at the top. Open one to read the transcript and turn what the caller asked for into a job without retyping it.',
      },
    ],
  },
  {
    id: 'tab-clients',
    label: 'Clients',
    description: 'The customer base',
    roles: OFFICE,
    trigger: 'tab',
    tab: 'clients',
    steps: [
      {
        placement: 'center',
        title: 'Everyone you have served',
        body: 'Their history, what they paid, and any notes your team left. Repeat customers are worth more than new ones — this is where you spot them.',
      },
    ],
  },
  {
    id: 'tab-analytics',
    label: 'Financials',
    description: 'Revenue and performance',
    roles: ['owner', 'manager', 'accountant'],
    trigger: 'tab',
    tab: 'analytics',
    steps: [
      {
        placement: 'center',
        title: 'Where the money came from',
        body: 'Revenue by month against your target, close rate, and how each technician is performing. Set the target in Settings and this screen judges you against it.',
      },
    ],
  },
  {
    id: 'tab-accounting',
    label: 'Accounting',
    description: 'Books, expenses and debtors',
    roles: ['owner', 'manager', 'accountant'],
    trigger: 'tab',
    tab: 'accounting',
    steps: [
      {
        placement: 'center',
        title: 'Books and debtors',
        body: 'Log expenses, see profit after costs, and chase what is unpaid. Overdue jobs get a reminder text automatically — this is where you watch it work.',
      },
    ],
  },
  {
    id: 'tab-marketing',
    label: 'Marketing',
    description: 'Ad spend and where leads come from',
    roles: OFFICE,
    trigger: 'tab',
    tab: 'marketing',
    steps: [
      {
        placement: 'center',
        title: 'What your ads actually returned',
        body: 'Revenue traced back to the channel that brought the lead, so you can see which ads pay for themselves. It only works if the lead source gets filled in at intake.',
      },
    ],
  },
  {
    id: 'tab-autokey',
    label: 'Auto-Key',
    description: 'Car key lookup',
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'autokey',
    steps: [
      {
        placement: 'center',
        title: 'Know the key before you drive',
        body: 'Enter the make and year or scan the VIN. You get the keyway, the transponder, whether it needs programming, and whether that blank is in stock.',
      },
    ],
  },
  {
    id: 'tab-masterkey',
    label: 'Master-Key',
    description: 'Pinning calculator',
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'masterkey',
    steps: [
      {
        placement: 'center',
        title: 'Pinning, worked out for you',
        body: 'Build a building, add its doors, and it calculates the pin stacks — then cross-checks for phantom keys that would open a door they should not.',
      },
    ],
  },
  {
    id: 'tab-inventory',
    label: 'Inventory',
    description: 'Stock, receiving and reorders',
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'inventory',
    steps: [
      {
        placement: 'center',
        title: 'What is on the shelf',
        body: 'Stock only moves on a real event — a delivery received, a part used on a job, a stocktake correction. Nothing is invented, so the count you see is the count you have.',
      },
      {
        placement: 'center',
        title: 'Receiving is the fast part',
        body: 'Drop in a supplier invoice or an Excel sheet and it reads the lines for you. Low stock shows up on the reorder list on its own.',
      },
    ],
  },
  {
    id: 'tab-brain',
    label: 'Assistant',
    description: 'What the assistant can do',
    roles: OFFICE,
    trigger: 'tab',
    tab: 'brain',
    steps: [
      {
        placement: 'center',
        title: 'It does things, not just talk',
        body: 'Ask it to book a job, text a client, send a payment link, or tell you who owes money — it carries the action out and shows you what it did.',
      },
      {
        placement: 'center',
        title: 'It remembers what you tell it',
        body: 'Say “we do not do safes” or “Maria handles all commercial work” once, and it holds on to that. Manage what it remembers in Settings.',
      },
    ],
  },
  {
    id: 'tab-settings',
    label: 'Settings',
    description: 'Company, team and switches',
    roles: ALL_ROLES,
    trigger: 'tab',
    tab: 'settings',
    steps: [
      {
        placement: 'center',
        title: 'Set it up once',
        body: 'Company details print on every invoice. Team, revenue targets, automatic client texts, and payments all live here.',
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
