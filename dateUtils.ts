// Shared, locale-aware timestamp formatting. Accepts an ISO string or epoch ms.
export function formatTimestamp(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const d = new Date(value);
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
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
