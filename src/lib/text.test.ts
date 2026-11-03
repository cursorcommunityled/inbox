import { describe, expect, it } from 'vitest';
import { linkifyToHtml, splitQuotedText } from './text';

describe('linkifyToHtml', () => {
  it('links http(s) and mailto and escapes markup', () => {
    const html = linkifyToHtml('See <script>alert(1)</script> https://example.com/a?x=1&y=2.');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="https://example.com/a?x=1&amp;y=2"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.endsWith('.')).toBe(true);
  });

  it('does not link javascript or data URLs', () => {
    const html = linkifyToHtml('javascript:alert(1) and data:text/html,hi');
    expect(html).not.toContain('<a ');
    expect(html).toContain('javascript:alert(1)');
  });

  it('links mailto', () => {
    expect(linkifyToHtml('write mailto:alice@example.com')).toContain('href="mailto:alice@example.com"');
  });

  it('routes text through a custom renderer and never links a URL that carries an address', () => {
    const render = (plain: string) => `[${plain.replace(/alice@example\.com/g, 'a•••@•••.com')}]`;
    const html = linkifyToHtml('write mailto:alice@example.com or https://example.com/u?e=alice@example.com, see https://example.com/ok', render);
    expect(html).not.toContain('alice@example.com');
    expect(html).toContain('[mailto:a•••@•••.com]');
    expect(html).toContain('[https://example.com/u?e=a•••@•••.com]');
    expect(html).toContain('<a href="https://example.com/ok"');
  });
});

describe('splitQuotedText', () => {
  it('returns a single segment when there is no quote', () => {
    expect(splitQuotedText('Hello\nthere')).toEqual([{ type: 'text', content: 'Hello\nthere' }]);
  });

  it('collapses an On wrote: reply and trailing quotes', () => {
    const text = [
      'Perfect — orange tent it is.',
      '',
      'On Thu, Oct 22, 2026 at 10:00 AM Alice Example <alice@example.com> wrote:',
      '> Can we meet at the orange tent?',
    ].join('\n');
    const segments = splitQuotedText(text);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ type: 'text' });
    expect(segments[0]?.content).toBe('Perfect — orange tent it is.');
    expect(segments[1]?.type).toBe('quote');
    expect(segments[1]?.content).toContain('wrote:');
  });

  it('does not treat a mid-message angle bracket as a quote when prose follows', () => {
    const text = 'Hello\n> not the end\nthere is more';
    expect(splitQuotedText(text)).toEqual([{ type: 'text', content: text }]);
  });

  it('collapses a trailing quote block and an Outlook header', () => {
    const quoted = splitQuotedText('Hello\n\n> one\n> two');
    expect(quoted[1]?.type).toBe('quote');
    const outlook = splitQuotedText('Hi\n\nFrom: Alice <alice@example.com>\nSent: Friday\n\nOlder body');
    expect(outlook[0]?.content).toBe('Hi');
    expect(outlook[1]?.content.startsWith('From:')).toBe(true);
  });
});
