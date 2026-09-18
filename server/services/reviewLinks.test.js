import { describe, it, expect } from 'vitest';
import { cleanReviewLink, reviewLinksOf, LEGACY_REVIEW_LINK_ID } from './reviewLinks.js';

describe('reviewLinksOf', () => {
  it('serves the old single Google link until the list is stored', () => {
    expect(reviewLinksOf({ googleReviewUrl: 'g.page/r/abc/review' })).toEqual([
      { id: LEGACY_REVIEW_LINK_ID, platform: 'google', label: 'Google', url: 'https://g.page/r/abc/review' },
    ]);
    expect(reviewLinksOf({ googleReviewUrl: '' })).toEqual([]);
    expect(reviewLinksOf({})).toEqual([]);
  });
  it('a stored list wins, even an empty one (the owner deleted every link)', () => {
    expect(reviewLinksOf({ googleReviewUrl: 'https://g.page/r/abc/review', reviewLinks: [] })).toEqual([]);
    const yelp = { id: 'y1', platform: 'yelp', label: 'Yelp', url: 'https://www.yelp.com/writeareview/biz/a' };
    expect(reviewLinksOf({ googleReviewUrl: 'https://g.page/r/abc/review', reviewLinks: [yelp] })).toEqual([yelp]);
  });
});

describe('cleanReviewLink', () => {
  it('keeps a good entry and fills the gaps', () => {
    expect(cleanReviewLink({ id: 'a', platform: 'tiktok', label: '', url: 'https://example.com/r' }))
      .toEqual({ id: 'a', platform: 'other', label: 'Review', url: 'https://example.com/r' });
  });
  it('drops what cannot go into a client text', () => {
    expect(cleanReviewLink({ id: 'a', platform: 'google', label: 'G', url: 'javascript:alert(1)' })).toBeNull();
    expect(cleanReviewLink({ id: 'a', platform: 'google', label: 'G', url: 'https://nodot/x' })).toBeNull();
    expect(cleanReviewLink({ id: '', platform: 'google', label: 'G', url: 'https://g.page/r/a/review' })).toBeNull();
    expect(cleanReviewLink({ id: 'a', platform: 'google', label: 'G', url: `https://x.com/${'a'.repeat(300)}` })).toBeNull();
    expect(cleanReviewLink(null)).toBeNull();
  });
});
