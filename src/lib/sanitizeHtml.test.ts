import { describe, expect, it } from 'vitest';
import { buildEmailSrcDoc, EMAIL_IFRAME_SANDBOX, sanitizeEmailHtml } from './sanitizeHtml';

const dirty = [
  '<p>Hello</p>',
  '<script>alert(\'xss\')</script>',
  '<img src="https://images.example.com/banner.png" alt="Banner" onerror="alert(1)">',
  '<a href="javascript:alert(1)">bad</a>',
  '<a href="https://example.com/rome">ok</a>',
  '<p style="background-image:url(https://images.example.com/bg.png)">Come hungry.</p>',
  '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="svg">',
].join('');

describe('sanitizeEmailHtml', () => {
  it('strips scripts, event handlers, javascript links, and remote images by default', () => {
    const html = sanitizeEmailHtml(dirty, false);
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toContain('alert');
    expect(html).not.toContain('images.example.com');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:image/svg');
    expect(html).toContain('Remote image blocked');
    expect(html).toContain('https://example.com/rome');
    expect(html).toContain('noopener');
    expect(html).toContain('Hello');
  });

  it('keeps remote images only when asked', () => {
    const html = sanitizeEmailHtml('<img src="https://images.example.com/a.png" alt="Banner">', true);
    expect(html).toContain('https://images.example.com/a.png');
    expect(html).not.toContain('Remote image blocked');
  });

  it('wraps blockquotes so quoted HTML can collapse', () => {
    const html = sanitizeEmailHtml('<p>New</p><blockquote>Old reply</blockquote>', false);
    expect(html).toContain('<details class="quoted-reply">');
    expect(html).toContain('Quoted text');
  });

  it('masks names and addresses inside the body when the privacy blur is on', () => {
    const personal =
      '<p>Hi, this is <b>Alice Example</b>.</p>' +
      '<p>Write to <a href="mailto:alice@example.com" title="Mail Alice">alice@example.com</a> or see <a href="https://example.com/x">the page</a>.</p>' +
      '<img alt="Alice Example portrait" src="data:image/png;base64,AA==">' +
      '<div class="gmail_quote">On Thu, Oct 22, 2026 at 10:00 AM Alice Example &lt;<a href="mailto:alice@example.com">alice@example.com</a>&gt; wrote:<blockquote>old</blockquote></div>';
    const plain = sanitizeEmailHtml(personal, false);
    expect(plain).toContain('Alice Example');
    expect(plain).toContain('href="mailto:alice@example.com"');
    expect(plain).not.toContain('class="pii"');

    const masked = sanitizeEmailHtml(personal, false, ['Alice Example', 'Alice']);
    expect(masked).not.toContain('Alice');
    expect(masked).not.toContain('alice@example.com');
    expect(masked).not.toContain('mailto:');
    expect(masked).toContain('<span class="pii">A••• E•••</span>');
    expect(masked).toContain('<span class="pii">a•••@•••.com</span>');
    expect(masked).toContain('alt="A••• E••• portrait"');
    expect(masked).toContain('title="Mail A•••"');
    expect(masked).toContain('href="https://example.com/x"');
    expect(masked).toContain('Hi, this is ');
    expect(masked).toContain('<details class="quoted-reply">');
  });

  it('masks addresses in HTML even when the export lists no names', () => {
    const masked = sanitizeEmailHtml('<p>Contact bob@example.org today</p>', false, []);
    expect(masked).toBe('<p>Contact <span class="pii">b•••@•••.org</span> today</p>');
  });
});

describe('email frame', () => {
  it('does not allow scripts in the sandbox', () => {
    const tokens = EMAIL_IFRAME_SANDBOX.split(' ');
    expect(tokens).not.toContain('allow-scripts');
    expect(tokens).not.toContain('allow-top-navigation');
    expect(tokens).toContain('allow-same-origin');
  });

  it('ships a locked-down document and omits remote URLs until enabled', () => {
    const blocked = buildEmailSrcDoc(dirty, { allowRemoteImages: false, theme: 'dark' });
    expect(blocked).toContain("default-src 'none'");
    expect(blocked).toContain('img-src data: blob:;');
    expect(blocked).toContain('color-scheme: dark');
    expect(blocked).not.toContain('https://images.example.com');
    expect(blocked.toLowerCase()).not.toContain('<script');

    const allowed = buildEmailSrcDoc('<img src="https://images.example.com/a.png" alt="">', {
      allowRemoteImages: true,
      theme: 'light',
    });
    expect(allowed).toContain('img-src data: blob: https: http:;');
    expect(allowed).toContain('https://images.example.com/a.png');
  });

  it('blurs .pii runs inside the frame when the privacy blur is on', () => {
    const doc = buildEmailSrcDoc('<p>alice@example.com</p>', { allowRemoteImages: false, theme: 'dark', privacyNames: [] });
    expect(doc).toContain('.pii { filter: blur(');
    expect(doc).toContain('<span class="pii">a•••@•••.com</span>');
    expect(doc).not.toContain('alice@example.com');
  });
});
