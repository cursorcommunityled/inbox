export interface TextSegment {
  type: 'text' | 'quote';
  content: string;
}

const WROTE_LINE = /^On .+ wrote:\s*$/i;
const ORIGINAL_MESSAGE = /^-{2,}\s*Original Message\s*-{2,}\s*$/i;
const FORWARDED = /^Begin forwarded message:\s*$/i;

/** Split a trailing quoted reply so the UI can collapse it. */
export function splitQuotedText(text: string): TextSegment[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const quoteAt = findQuoteStart(lines);
  if (quoteAt < 0) return [{ type: 'text', content: normalized }];

  const head = lines.slice(0, quoteAt).join('\n').replace(/\n+$/, '');
  const tail = lines.slice(quoteAt).join('\n').replace(/^\n+/, '');
  const segments: TextSegment[] = [];
  if (head.trim()) segments.push({ type: 'text', content: head });
  if (tail.trim()) segments.push({ type: 'quote', content: tail });
  return segments.length > 0 ? segments : [{ type: 'text', content: normalized }];
}

function findQuoteStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (WROTE_LINE.test(trimmed) || ORIGINAL_MESSAGE.test(trimmed) || FORWARDED.test(trimmed)) {
      return i;
    }
    if (/^From:\s+\S/.test(trimmed) && looksLikeOutlookHeader(lines, i)) return i;
    if (line.startsWith('>') && restIsQuote(lines.slice(i))) return i;
  }
  return -1;
}

function looksLikeOutlookHeader(lines: string[], index: number): boolean {
  return lines
    .slice(index + 1, index + 4)
    .some((line) => /^(Sent|Date|To|Subject):\s*/.test(line.trim()));
}

function restIsQuote(lines: string[]): boolean {
  return lines.length > 0 && lines.every((line) => line.trim() === '' || line.trimStart().startsWith('>'));
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const URL_PATTERN = /(?:https?:\/\/|mailto:)[^\s<]+/gi;

/**
 * Escape plain text and turn http(s) and mailto URLs into links.
 * `renderText` replaces the plain escaping (the privacy blur uses it to mask
 * names and addresses); a URL that carries an address is then rendered as
 * text through it instead of becoming a link, so no href keeps the original.
 */
export function linkifyToHtml(text: string, renderText: (plain: string) => string = escapeHtml): string {
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const masking = renderText !== escapeHtml;
  let html = '';
  let last = 0;
  for (const match of input.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    const raw = match[0] ?? '';
    html += renderText(input.slice(last, index));
    let url = raw;
    let trailing = '';
    while (url && /[.,;:!?)\]]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (isSafeHref(url) && !(masking && url.includes('@'))) {
      html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    } else {
      html += renderText(url);
    }
    html += escapeHtml(trailing);
    last = index + raw.length;
  }
  html += renderText(input.slice(last));
  return html;
}

function isSafeHref(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:');
}

export function snippetFromText(text: string, max = 140): string {
  const segments = splitQuotedText(text);
  const main = segments.find((segment) => segment.type === 'text')?.content ?? segments[0]?.content ?? '';
  const oneLine = main.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

export function htmlToPlainSnippet(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}
