// Review links live in the settings blob as a list: { id, platform, label, url }.
// Before the list existed there was ONE field, googleReviewUrl. Until someone edits the
// list, that old link is served as the list's only entry, so nothing configured is lost.

const PLATFORMS = new Set(['google', 'yelp', 'facebook', 'nextdoor', 'other']);
export const MAX_REVIEW_LINKS = 20;
export const LEGACY_REVIEW_LINK_ID = 'google-legacy';

/** A stored/incoming entry, or null when it can't be texted to a client. */
export function cleanReviewLink(x) {
  if (!x || typeof x !== 'object') return null;
  const id = String(x.id || '').trim().slice(0, 64);
  const url = String(x.url || '').trim();
  if (!id || url.length > 300 || !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return null;
  const platform = PLATFORMS.has(x.platform) ? x.platform : 'other';
  const label = String(x.label || '').trim().slice(0, 40) || 'Review';
  return { id, platform, label, url };
}

/** The effective list: the stored one, or the old single Google link while none is stored. */
export function reviewLinksOf(settings) {
  if (Array.isArray(settings?.reviewLinks)) {
    return settings.reviewLinks.map(cleanReviewLink).filter(Boolean);
  }
  let legacy = String(settings?.googleReviewUrl || '').trim();
  if (!legacy) return [];
  if (!/^https?:\/\//i.test(legacy)) legacy = `https://${legacy}`;
  const link = cleanReviewLink({ id: LEGACY_REVIEW_LINK_ID, platform: 'google', label: 'Google', url: legacy });
  return link ? [link] : [];
}
