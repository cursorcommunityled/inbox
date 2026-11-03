/**
 * Privacy blur ("demo mode"): the owner can screen-share the inbox without
 * exposing who wrote to them. Every name and address is replaced by a masked
 * placeholder ("A••• E•••", "a•••@•••.com") and the CSS then blurs the
 * placeholder, so neither a zoomed screenshot nor a text selection reveals
 * the original. Everything here is pure string work; the React side lives
 * in components/Privacy.tsx.
 */

import type { InboxExport, Participant } from '../types/inbox';
import { escapeHtml } from './text';

export const PRIVACY_STORAGE_KEY = 'grokbot-inbox-privacy-blur';
/** `?blur=1` forces the blur on. `?demo` is taken (it opens the sample inbox) and `#k=` is never read here. */
export const PRIVACY_QUERY_PARAM = 'blur';

export type MaskKind = 'name' | 'address' | 'people' | 'text';

export interface MaskSegment {
  text: string;
  masked: boolean;
}

const DOT = '•';
const DOTS = DOT.repeat(3);

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const WROTE_LINE = /^(\s*(?:>\s*)*)On (.+?) wrote:(\s*)$/i;
const HEADER_LINE = /^(\s*(?:>\s*)*)(From|To|Cc|Bcc|Reply-To|Sender)(\s*:\s*)(.+)$/i;
const BRACKETED = /^(.*?)\s*<([^<>]*)>\s*$/;

/** Reads the force-on flag from a query string. Only `?blur` is consulted, never the hash. */
export function readForcedBlur(search: string): boolean {
  const value = new URLSearchParams(search).get(PRIVACY_QUERY_PARAM);
  if (value === null) return false;
  return value === '' || /^(1|on|true|yes)$/i.test(value);
}

export function readStoredBlur(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(PRIVACY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeStoredBlur(storage: Pick<Storage, 'setItem'> | null, on: boolean): void {
  try {
    storage?.setItem(PRIVACY_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* private mode or quota */
  }
}

/** "Alice Example" → "A••• E•••". Tokens that do not start with a letter ("+2", "·") are kept. */
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('@')) return maskAddress(trimmed);
  return trimmed
    .split(/(\s+)/)
    .map((token) => (/^\p{L}/u.test(token) ? `${[...token][0]}${DOTS}` : token))
    .join('');
}

/** "alice@example.com" → "a•••@•••.com". The top-level domain stays so the shape still reads as an address. */
export function maskAddress(address: string): string {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return maskName(trimmed);
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${[...local][0]}${DOTS}@${DOTS}${tld}`;
}

/** Masks one entry of a recipient list: "Name <addr>", "addr", or "Name". */
export function maskPerson(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) return trimmed;
  const bracket = trimmed.match(BRACKETED);
  if (bracket) {
    const name = bracket[1].replace(/^"|"$/g, '').trim();
    const address = bracket[2].trim();
    const maskedAddress = address.includes('@') ? maskAddress(address) : maskName(address);
    return name ? `${maskName(name)} <${maskedAddress}>` : `<${maskedAddress}>`;
  }
  return trimmed.includes('@') ? maskAddress(trimmed) : maskName(trimmed);
}

/** "Alice <a@x.com>, b@y.org, Carol +2" → every entry masked, separators kept. */
export function maskPeople(list: string): string {
  return list
    .split(/(\s*[,;]\s*)/)
    .map((part, index) => (index % 2 === 1 ? part : maskPerson(part)))
    .join('');
}

export function maskParticipant(participant: Participant): Participant {
  const name = participant.name?.trim();
  return {
    ...participant,
    name: name ? maskName(name) : participant.name,
    address: participant.address ? maskAddress(participant.address) : participant.address,
  };
}

/** Every distinct display name in an export, longest first so "Alice Example" wins over "Alice". */
export function collectNames(inbox: Pick<InboxExport, 'threads'> | null): string[] {
  const names = new Set<string>();
  const add = (person: Participant | undefined) => {
    const name = person?.name?.trim();
    if (!name || name.includes('@')) return;
    names.add(name);
    // A signature is usually a first name on its own line.
    for (const part of name.split(/\s+/)) {
      if (part.length >= 3 && /^\p{Lu}/u.test(part)) names.add(part);
    }
  };
  for (const thread of inbox?.threads ?? []) {
    thread.participants.forEach(add);
    for (const message of thread.messages) {
      add(message.from);
      message.to.forEach(add);
      message.cc?.forEach(add);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const nameMatchers = new WeakMap<readonly string[], RegExp | null>();

function namePattern(names: readonly string[]): RegExp | null {
  const cached = nameMatchers.get(names);
  if (cached !== undefined) return cached;
  const pattern =
    names.length === 0 ? null : new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  nameMatchers.set(names, pattern);
  return pattern;
}

/**
 * Free text (a message body, a quoted original, a command block). Addresses
 * are masked wherever they appear, "On … wrote:" and "From:/To:/Cc:" header
 * lines are masked whole, and known display names are masked when the
 * export lists them. Everything else stays readable.
 */
export function maskTextSegments(text: string, names: readonly string[] = []): MaskSegment[] {
  const out: MaskSegment[] = [];
  const lines = text.split(/(\r?\n)/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (i % 2 === 1) {
      push(out, line, false);
      continue;
    }
    const wrote = line.match(WROTE_LINE);
    if (wrote) {
      push(out, `${wrote[1]}On `, false);
      push(out, maskWroteMiddle(wrote[2]), true);
      push(out, ` wrote:${wrote[3]}`, false);
      continue;
    }
    const header = line.match(HEADER_LINE);
    if (header && looksLikePeople(header[4], names)) {
      push(out, `${header[1]}${header[2]}${header[3]}`, false);
      push(out, maskPeople(header[4]), true);
      continue;
    }
    maskInline(line, names, out);
  }
  return out;
}

export function maskText(text: string, names: readonly string[] = []): string {
  return maskTextSegments(text, names)
    .map((segment) => segment.text)
    .join('');
}

/** Escaped HTML with every masked run wrapped in `<span class="pii">`, so the stylesheet can blur it. */
export function maskTextToHtml(text: string, names: readonly string[] = []): string {
  return maskTextSegments(text, names)
    .map((segment) => (segment.masked ? `<span class="pii">${escapeHtml(segment.text)}</span>` : escapeHtml(segment.text)))
    .join('');
}

export function mask(kind: MaskKind, value: string, names: readonly string[] = []): string {
  switch (kind) {
    case 'name':
      return maskName(value);
    case 'address':
      return maskAddress(value);
    case 'people':
      return maskPeople(value);
    default:
      return maskText(value, names);
  }
}

/** A "From:"/"To:" value is a people list when it carries an address or a known name; "To: whom it may concern" is prose. */
function looksLikePeople(value: string, names: readonly string[]): boolean {
  if (value.includes('@') || value.includes('<')) return true;
  const pattern = namePattern(names);
  if (!pattern) return false;
  pattern.lastIndex = 0;
  const found = pattern.test(value);
  pattern.lastIndex = 0;
  return found;
}

function maskWroteMiddle(middle: string): string {
  // "Thu, Oct 22, 2026 at 10:00 AM Alice Example <alice@example.com>" → keep the shape, hide the words.
  return middle
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      if (token.includes('@')) return maskPerson(token);
      return /^\p{L}/u.test(token) ? `${[...token][0]}${DOTS}` : token;
    })
    .join('');
}

function maskInline(line: string, names: readonly string[], out: MaskSegment[]): void {
  const hits: { start: number; end: number; replacement: string }[] = [];
  for (const match of line.matchAll(EMAIL)) {
    const start = match.index ?? 0;
    hits.push({ start, end: start + match[0].length, replacement: maskAddress(match[0]) });
  }
  const pattern = namePattern(names);
  if (pattern) {
    for (const match of line.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (hits.some((hit) => start < hit.end && end > hit.start)) continue;
      hits.push({ start, end, replacement: maskName(match[0]) });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    push(out, line.slice(cursor, hit.start), false);
    push(out, hit.replacement, true);
    cursor = hit.end;
  }
  push(out, line.slice(cursor), false);
}

function push(out: MaskSegment[], text: string, masked: boolean): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.masked === masked) last.text += text;
  else out.push({ text, masked });
}
