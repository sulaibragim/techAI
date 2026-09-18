// Review links: the pages a client lands on to leave us a review. What matters is that
// the link opens the review FORM, not the business page — one tap and they are typing.
// Google's "Get more reviews" link (g.page/r/…/review) does exactly that; a Maps or
// search link makes the client hunt for the button, and most of them won't.
import type { ReviewLink, ReviewPlatform } from './types';

export interface ReviewPlatformInfo {
  label: string;
  /** Where the owner finds the direct review-form link. */
  howTo: string;
  /** Said once, next to the link, when the platform punishes asking. */
  caution?: string;
}

export const REVIEW_PLATFORMS: Record<ReviewPlatform, ReviewPlatformInfo> = {
  google: {
    label: 'Google',
    howTo: 'Google Business Profile → Read reviews → Get more reviews → copy the link. It looks like g.page/r/…/review and opens the review form straight away.',
  },
  yelp: {
    label: 'Yelp',
    howTo: 'Open your Yelp page, tap "Write a review" and copy the address from the browser: yelp.com/writeareview/biz/…',
    caution: "Yelp's rules forbid asking clients for reviews. Reviews it thinks were requested can be hidden, and Yelp may put a warning on your page.",
  },
  facebook: {
    label: 'Facebook',
    howTo: 'Your Facebook page address with /reviews at the end.',
  },
  nextdoor: {
    label: 'Nextdoor',
    howTo: 'The link on your Nextdoor business page that asks neighbors to recommend you.',
  },
  other: {
    label: 'Other',
    howTo: 'Any link that opens a review form: BBB, Angi, Thumbtack…',
  },
};

export const REVIEW_PLATFORM_IDS = Object.keys(REVIEW_PLATFORMS) as ReviewPlatform[];

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, '');

/** Which platform a pasted link belongs to, if we can tell. */
export function detectReviewPlatform(raw: string): ReviewPlatform | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/(^|[/.])(g\.page|goo\.gl|g\.co|share\.google|google\.[a-z.]+)(\/|$)/.test(s)) return 'google';
  if (/(^|[/.])yelp\.[a-z.]+(\/|$)/.test(s)) return 'yelp';
  if (/(^|[/.])(facebook\.com|fb\.com|fb\.me)(\/|$)/.test(s)) return 'facebook';
  if (/(^|[/.])nextdoor\.com(\/|$)/.test(s)) return 'nextdoor';
  return null;
}

export interface ReviewUrlCheck {
  /** The cleaned link to store (https added, Google short link completed). */
  url: string;
  /** The link can't be used at all. */
  error?: string;
  /** Usable, but it won't open the review form directly. */
  warning?: string;
}

export function checkReviewUrl(raw: string, platform?: ReviewPlatform): ReviewUrlCheck {
  let s = raw.trim().replace(/^[<"'(]+/, '').replace(/[>"')]+$/, '');
  if (!s) return { url: '', error: 'Paste the link first.' };
  if (/\s/.test(s)) return { url: s, error: 'A link has no spaces. Copy it again.' };
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:/]+:\d/.test(s)) {
      return { url: s, error: 'Only web links (https://…) open from a text message.' };
    }
    s = `https://${s.replace(/^\/+/, '')}`;
  }
  let u: URL;
  try { u = new URL(s); } catch { return { url: s, error: "That doesn't look like a web link." }; }
  const host = hostOf(u);
  if (!host.includes('.')) return { url: s, error: "That doesn't look like a web link." };

  // g.page/r/<code> opens the profile; the same link with /review opens the form.
  if (host === 'g.page' && /^\/r\/[^/]+\/?$/.test(u.pathname)) {
    u.pathname = `${u.pathname.replace(/\/$/, '')}/review`;
  }
  const url = u.toString();
  if (url.length > 300) return { url, error: 'This link is too long to text. Use the short link from the platform.' };

  const kind = platform || detectReviewPlatform(url);
  if (kind === 'google') {
    const direct = (host === 'g.page' && /\/review\/?$/.test(u.pathname))
      || (host === 'search.google.com' && u.pathname.startsWith('/local/writereview'))
      || (/(^|\.)google\./.test(host) && /lrd=[^&]*,3/.test(u.hash)); // search link that pops the review box
    if (!direct) {
      return { url, warning: 'This opens your Google listing, not the review form. Clients would have to find "Write a review" themselves. Use the link from Get more reviews instead.' };
    }
  }
  if (kind === 'yelp' && !u.pathname.toLowerCase().startsWith('/writeareview')) {
    return { url, warning: 'This is your Yelp page, not the review form. Clients would have to find "Write a review" themselves.' };
  }
  return { url };
}

/** The link a review request uses unless the sender picks another: Google first. */
export function primaryReviewLink(links: ReviewLink[] | undefined): ReviewLink | undefined {
  const list = links || [];
  return list.find(l => l.platform === 'google') || list[0];
}

/** "g.page/r/CVk…/review" — short enough for a list row. */
export function displayReviewUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}
