import { describe, it, expect } from 'vitest';
import { checkReviewUrl, detectReviewPlatform, primaryReviewLink, displayReviewUrl } from './reviewLinks';
import type { ReviewLink } from './types';

describe('checkReviewUrl', () => {
  it('accepts the Google review-form link as is', () => {
    expect(checkReviewUrl('https://g.page/r/CVkT7rL3xYzaEBM/review', 'google'))
      .toEqual({ url: 'https://g.page/r/CVkT7rL3xYzaEBM/review' });
  });
  it('adds https:// and completes a Google short link to the form', () => {
    expect(checkReviewUrl('g.page/r/CVkT7rL3xYzaEBM', 'google'))
      .toEqual({ url: 'https://g.page/r/CVkT7rL3xYzaEBM/review' });
    expect(checkReviewUrl(' https://g.page/r/CVkT7rL3xYzaEBM/ ').url)
      .toBe('https://g.page/r/CVkT7rL3xYzaEBM/review');
  });
  it('treats the writereview and search-popup links as direct', () => {
    expect(checkReviewUrl('https://search.google.com/local/writereview?placeid=ChIJ123', 'google').warning).toBeUndefined();
    expect(checkReviewUrl('https://www.google.com/search?q=trustkey#lrd=0x872b1,3,,,', 'google').warning).toBeUndefined();
  });
  it('warns when a Google link opens the listing, not the form', () => {
    expect(checkReviewUrl('https://maps.app.goo.gl/AbCdEf', 'google').warning).toMatch(/not the review form/);
    expect(checkReviewUrl('https://www.google.com/maps/place/TrustKey', 'google').warning).toMatch(/not the review form/);
  });
  it('warns when a Yelp link is the business page, not the form', () => {
    expect(checkReviewUrl('https://www.yelp.com/biz/trustkey-locksmith-phoenix', 'yelp').warning).toMatch(/not the review form/);
    expect(checkReviewUrl('https://www.yelp.com/writeareview/biz/WavvLdfdP6g8aZTtbBQHTw', 'yelp').warning).toBeUndefined();
  });
  it('rejects what a phone cannot open from a text', () => {
    expect(checkReviewUrl('', 'google').error).toBeTruthy();
    expect(checkReviewUrl('javascript:alert(1)', 'other').error).toBeTruthy();
    expect(checkReviewUrl('mailto:hi@trustkeyaz.com', 'other').error).toBeTruthy();
    expect(checkReviewUrl('trust key reviews', 'other').error).toBeTruthy();
    expect(checkReviewUrl('localhost:3000/x', 'other').error).toBeTruthy();
  });
});

describe('detectReviewPlatform', () => {
  it('recognizes the platforms from a pasted link', () => {
    expect(detectReviewPlatform('https://g.page/r/abc/review')).toBe('google');
    expect(detectReviewPlatform('maps.app.goo.gl/xyz')).toBe('google');
    expect(detectReviewPlatform('https://www.yelp.com/writeareview/biz/abc')).toBe('yelp');
    expect(detectReviewPlatform('https://facebook.com/trustkey/reviews')).toBe('facebook');
    expect(detectReviewPlatform('https://nextdoor.com/pages/trustkey')).toBe('nextdoor');
    expect(detectReviewPlatform('https://notgoogle.com/x')).toBeNull();
  });
});

describe('primaryReviewLink', () => {
  const yelp: ReviewLink = { id: 'y', platform: 'yelp', label: 'Yelp', url: 'https://www.yelp.com/writeareview/biz/a' };
  const google: ReviewLink = { id: 'g', platform: 'google', label: 'Google', url: 'https://g.page/r/a/review' };
  it('prefers Google, then whatever comes first', () => {
    expect(primaryReviewLink([yelp, google])).toBe(google);
    expect(primaryReviewLink([yelp])).toBe(yelp);
    expect(primaryReviewLink([])).toBeUndefined();
    expect(primaryReviewLink(undefined)).toBeUndefined();
  });
  it('shortens a link for display', () => {
    expect(displayReviewUrl('https://www.yelp.com/writeareview/biz/a')).toBe('yelp.com/writeareview/biz/a');
  });
});
