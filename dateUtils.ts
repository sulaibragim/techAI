// Date-only strings (YYYY-MM-DD) must be parsed as LOCAL midnight. `new Date('2026-06-01')`
// is UTC midnight, which renders as the previous day anywhere west of Greenwich.
const parseLocal = (value: string | number) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T00:00:00')
    : new Date(value);

// Shared, locale-aware timestamp formatting. Accepts an ISO string or epoch ms.
export function formatTimestamp(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const d = parseLocal(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const d = parseLocal(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
