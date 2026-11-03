import DOMPurify from 'dompurify';
import { maskText, maskTextSegments } from './privacy';

export interface EmailFrameOptions {
  allowRemoteImages: boolean;
  theme: 'light' | 'dark';
  /**
   * Privacy blur: when set, addresses and these display names inside the
   * message are replaced by masked placeholders wrapped in `.pii`, which the
   * frame stylesheet blurs. `mailto:` links lose their href as well.
   */
  privacyNames?: readonly string[];
}

/**
 * Sandbox for the email frame.
 * `allow-scripts` is intentionally absent, so message HTML cannot run JavaScript.
 * Never combine `allow-scripts` with `allow-same-origin`.
 * `allow-same-origin` exists only so the parent can measure the frame height.
 * Popups let an http(s) link open in a new tab. Top navigation is not allowed.
 */
export const EMAIL_IFRAME_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

const FRAME_COLORS = {
  light: {
    fg: '#111113',
    muted: '#5c5c66',
    link: '#111113',
    border: '#e4e4e7',
    chip: '#f4f4f5',
  },
  dark: {
    fg: '#fafafa',
    muted: '#9a9aa3',
    link: '#fafafa',
    border: '#2a2a2e',
    chip: '#19191c',
  },
} as const;

type Purifier = {
  sanitize: (dirty: string, config?: object) => string;
  addHook: (hook: string, callback: (node: Node) => void) => void;
};

let purifier: Purifier | null = null;

function getPurifier(): Purifier {
  if (purifier) return purifier;
  const candidate = DOMPurify as unknown as Purifier & ((window?: Window) => Purifier);
  const instance = typeof candidate.sanitize === 'function' ? candidate : candidate(window);
  instance.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element) || node.tagName !== 'A') return;
    const href = node.getAttribute('href');
    if (!href || !isAllowedLink(href)) {
      node.removeAttribute('href');
      return;
    }
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('target', '_blank');
  });
  purifier = instance;
  return instance;
}

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'link',
    'meta',
    'base',
    'style',
  ],
  FORBID_ATTR: ['srcset', 'action', 'formaction', 'xlink:href'],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeEmailHtml(html: string, allowRemoteImages: boolean, privacyNames?: readonly string[]): string {
  const clean = String(getPurifier().sanitize(html, PURIFY_CONFIG));
  return rewriteUntrustedHtml(clean, allowRemoteImages, privacyNames);
}

export function htmlHasRemoteImages(html: string): boolean {
  return (
    /<(?:img|image|video|source)\b[^>]*\bsrc\s*=\s*['"]?\s*(?:https?:|\/\/)/i.test(html) ||
    /url\(\s*['"]?\s*(?:https?:|\/\/)/i.test(html) ||
    /\bbackground\s*=\s*['"]?\s*(?:https?:|\/\/)/i.test(html)
  );
}

export function buildEmailSrcDoc(html: string, options: EmailFrameOptions): string {
  const body = sanitizeEmailHtml(html, options.allowRemoteImages, options.privacyNames);
  const colors = FRAME_COLORS[options.theme];
  const imgSrc = options.allowRemoteImages ? 'data: blob: https: http:' : 'data: blob:';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; font-src data:; media-src ${imgSrc};">
<style>
  :root { color-scheme: ${options.theme}; }
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: ${colors.fg};
    font: 15px/1.6 Inter, Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    overflow-wrap: anywhere;
  }
  img, video { max-width: 100%; height: auto; }
  a { color: ${colors.link}; text-decoration: underline; text-underline-offset: 2px; }
  blockquote {
    margin: 0.6em 0;
    padding-left: 0.8em;
    border-left: 3px solid ${colors.border};
    color: ${colors.muted};
  }
  details.quoted-reply { margin-top: 12px; }
  details.quoted-reply > summary { cursor: pointer; color: ${colors.muted}; font-size: 13px; }
  .blocked-image {
    display: inline-block;
    margin: 4px 0;
    padding: 3px 8px;
    border: 1px dashed ${colors.border};
    border-radius: 6px;
    background: ${colors.chip};
    color: ${colors.muted};
    font-size: 12px;
  }
  table { max-width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; }
  .pii { filter: blur(0.32em); user-select: none; -webkit-user-select: none; pointer-events: none; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function rewriteUntrustedHtml(html: string, allowRemoteImages: boolean, privacyNames?: readonly string[]): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;
  for (const el of Array.from(body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcset') {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === 'style') {
        const next = stripRemoteCss(attr.value, allowRemoteImages);
        if (next.trim()) el.setAttribute('style', next);
        else el.removeAttribute('style');
      }
    }
    rewriteUrlAttribute(el, 'src', allowRemoteImages);
    rewriteUrlAttribute(el, 'poster', allowRemoteImages);
    rewriteUrlAttribute(el, 'background', allowRemoteImages);
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href && !isAllowedLink(href)) el.removeAttribute('href');
    }
    if (privacyNames) maskElementAttributes(el, privacyNames);
  }
  collapseQuotes(body);
  if (privacyNames) maskTextNodes(body, privacyNames);
  return body.innerHTML;
}

/** Tooltips, alt text and `mailto:` hrefs can carry a name or an address too. */
function maskElementAttributes(el: Element, names: readonly string[]): void {
  for (const name of ['title', 'alt', 'aria-label']) {
    const value = el.getAttribute(name);
    if (value) el.setAttribute(name, maskText(value, names));
  }
  const href = el.getAttribute('href');
  if (href && (href.trim().toLowerCase().startsWith('mailto:') || href.includes('@'))) el.removeAttribute('href');
}

/** Replaces every text run that contains an address or a known name with masked `.pii` spans. */
function maskTextNodes(body: HTMLElement, names: readonly string[]): void {
  const doc = body.ownerDocument;
  const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  for (const node of nodes) {
    const segments = maskTextSegments(node.data, names);
    if (!segments.some((segment) => segment.masked)) continue;
    const fragment = doc.createDocumentFragment();
    for (const segment of segments) {
      if (!segment.masked) {
        fragment.append(doc.createTextNode(segment.text));
        continue;
      }
      const span = doc.createElement('span');
      span.className = 'pii';
      span.textContent = segment.text;
      fragment.append(span);
    }
    node.replaceWith(fragment);
  }
}

function rewriteUrlAttribute(el: Element, name: string, allowRemoteImages: boolean): void {
  const value = el.getAttribute(name);
  if (!value) return;
  if (isDangerousData(value) || value.trim().toLowerCase().startsWith('cid:')) {
    replaceBlockedImage(el, name);
    return;
  }
  if (isRemoteUrl(value) && !allowRemoteImages) replaceBlockedImage(el, name);
}

function replaceBlockedImage(el: Element, name: string): void {
  el.removeAttribute(name);
  if (el.tagName === 'IMG' || el.tagName === 'IMAGE') {
    const span = el.ownerDocument.createElement('span');
    span.className = 'blocked-image';
    span.textContent = 'Remote image blocked';
    el.replaceWith(span);
  }
}

function collapseQuotes(body: HTMLElement): void {
  const gmail = Array.from(body.querySelectorAll('.gmail_quote'));
  const targets =
    gmail.length > 0
      ? gmail
      : Array.from(body.querySelectorAll('blockquote')).filter((node) => !node.parentElement?.closest('blockquote'));
  for (const node of targets) {
    if (node.closest('details')) continue;
    const details = node.ownerDocument.createElement('details');
    details.className = 'quoted-reply';
    const summary = node.ownerDocument.createElement('summary');
    summary.textContent = 'Quoted text';
    node.parentNode?.insertBefore(details, node);
    details.append(summary, node);
  }
}

function isRemoteUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith('http:') || v.startsWith('https:') || v.startsWith('//');
}

function isDangerousData(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v.startsWith('data:')) return false;
  const mime = v.slice(5).split(/[;,]/)[0] ?? '';
  return /svg|html|xml|script|javascript/.test(mime);
}

function isAllowedLink(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith('https://') || v.startsWith('http://') || v.startsWith('mailto:');
}

function stripRemoteCss(style: string, allowRemoteImages: boolean): string {
  return style.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (full, _quote: string, url: string) => {
    const target = String(url).trim();
    const lower = target.toLowerCase();
    if (lower.startsWith('data:') || lower.startsWith('blob:')) {
      return isDangerousData(target) ? 'none' : full;
    }
    if (allowRemoteImages && (lower.startsWith('https:') || lower.startsWith('http:'))) return full;
    return 'none';
  });
}
