import { describe, it, expect } from 'vitest';
import { isPrivateAddress, assertPublicUrl, htmlToText } from './pageFetch.js';

// /api/ai/price-scan fetches a URL the user typed. That is an SSRF primitive unless the
// address check holds, so pin it: the cloud metadata service and the private ranges are
// the whole point of these tests.

describe('isPrivateAddress', () => {
  it('blocks loopback, private, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.4.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
      expect(isPrivateAddress(ip, 4), ip).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '192.167.1.1', '99.84.0.1']) {
      expect(isPrivateAddress(ip, 4), ip).toBe(false);
    }
  });

  it('blocks the IPv6 equivalents, including v4-mapped ones', () => {
    expect(isPrivateAddress('::1', 6)).toBe(true);
    expect(isPrivateAddress('fe80::1', 6)).toBe(true);
    expect(isPrivateAddress('fd00::1', 6)).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254', 6)).toBe(true);
    expect(isPrivateAddress('2606:4700::1111', 6)).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('refuses anything that is not http(s)', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow();
    await expect(assertPublicUrl('not a url')).rejects.toThrow();
  });

  it('refuses non-web ports', async () => {
    await expect(assertPublicUrl('http://93.184.216.34:5432/')).rejects.toThrow();
  });

  it('refuses localhost and the metadata service by literal address', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:80/admin')).rejects.toThrow();
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(assertPublicUrl('http://10.1.2.3/')).rejects.toThrow();
  });
});

describe('htmlToText', () => {
  it('keeps the visible copy and drops scripts and markup', () => {
    const text = htmlToText(`
      <html><head><title>x</title><style>.a{color:red}</style></head>
      <body><script>var stolen = 1;</script>
        <h1>Prices</h1>
        <ul><li>Car lockout &#36;139</li><li>Home lockout $159</li></ul>
        <!-- hidden note -->
      </body></html>`);
    expect(text).toContain('Car lockout $139');
    expect(text).toContain('Home lockout $159');
    expect(text).not.toContain('stolen');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('hidden note');
    expect(text).not.toContain('<');
  });

  it('keeps table cells apart so a price stays with its service', () => {
    const text = htmlToText('<table><tr><td>Rekey</td><td>$149</td></tr></table>');
    expect(text.replace(/\s+/g, ' ')).toContain('Rekey $149');
  });

  it('survives empty input', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
  });
});
