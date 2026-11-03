import { describe, expect, it } from 'vitest';
import {
  collectNames,
  maskAddress,
  maskName,
  maskParticipant,
  maskPeople,
  maskText,
  maskTextSegments,
  maskTextToHtml,
  readForcedBlur,
  readStoredBlur,
  writeStoredBlur,
} from './privacy';

const NAMES = ['Alice Example', 'Alice', 'Demo Bot', 'Demo'];

describe('maskName / maskAddress', () => {
  it('keeps one letter per word and hides the rest', () => {
    expect(maskName('Alice Example')).toBe('A••• E•••');
    expect(maskName('  Bob ')).toBe('B•••');
    expect(maskName('Demo Bot +2')).toBe('D••• B••• +2');
  });

  it('masks the local part and the domain but keeps the top-level domain', () => {
    expect(maskAddress('alice@example.com')).toBe('a•••@•••.com');
    expect(maskAddress('demo+roma@mail.grokbot.com')).toBe('d•••@•••.com');
  });

  it('treats a bare address passed as a name like an address', () => {
    expect(maskName('marco@example.com')).toBe('m•••@•••.com');
  });

  it('never leaks more than the first character (plus the top-level domain)', () => {
    for (const input of ['Alice Example', 'alice@example.com', 'Örjan Åkesson', 'o.brien+tag@sub.example.co.uk']) {
      const masked = maskName(input);
      expect(masked).not.toContain(input);
      const tld = input.includes('@') ? input.slice(input.lastIndexOf('.') + 1) : '';
      for (const word of input.split(/[\s@.+]/).filter((w) => w.length > 1 && w !== tld)) {
        expect(masked).not.toContain(word);
      }
    }
    expect(maskName('o.brien+tag@sub.example.co.uk')).toBe('o•••@•••.uk');
  });
});

describe('maskPeople', () => {
  it('masks every entry of a recipient list and keeps the separators', () => {
    expect(maskPeople('Alice Example <alice@example.com>, events@example.com, Carol')).toBe('A••• E••• <a•••@•••.com>, e•••@•••.com, C•••');
  });

  it('masks a participant object', () => {
    expect(maskParticipant({ name: 'Alice Example', address: 'alice@example.com' })).toEqual({ name: 'A••• E•••', address: 'a•••@•••.com' });
    expect(maskParticipant({ address: 'x@y.org' })).toEqual({ address: 'x•••@•••.org' });
  });
});

describe('maskText', () => {
  it('masks addresses inside prose and leaves the rest readable', () => {
    expect(maskText('Write to alice@example.com or marco@example.com by Friday.')).toBe('Write to a•••@•••.com or m•••@•••.com by Friday.');
  });

  it('masks "On … wrote:" header lines whole', () => {
    const masked = maskText('Thanks!\n\nOn Thu, Oct 22, 2026 at 10:00 AM Alice Example <alice@example.com> wrote:\n> hi');
    expect(masked.startsWith('Thanks!\n\nOn ')).toBe(true);
    expect(masked).toContain(' wrote:\n> hi');
    expect(masked).not.toContain('Alice');
    expect(masked).not.toContain('alice@example.com');
    expect(masked).toContain('On Thu, Oct 22, 2026 at 10:00 AM A••• E••• <a•••@•••.com> wrote:');
    expect(maskText('On Oct 23, 2026, 1:40 PM UTC, Marco Rossi wrote:')).toBe('On Oct 23, 2026, 1:40 PM UTC, M••• R••• wrote:');
    expect(maskText('> On 23 Oct 2026, marco@example.com wrote:')).toBe('> On 23 Oct 2026, m•••@•••.com wrote:');
  });

  it('masks forwarded and Outlook headers but not prose that happens to start with To:', () => {
    const forwarded = maskText('---------- Forwarded message ----------\nFrom: Alice Example <alice@example.com>\nTo: Demo Bot <demo@mail.grokbot.com>, bob@example.org\nSubject: Map', NAMES);
    expect(forwarded).toContain('From: A••• E••• <a•••@•••.com>');
    expect(forwarded).toContain('To: D••• B••• <d•••@•••.com>, b•••@•••.org');
    expect(forwarded).toContain('Subject: Map');
    expect(maskText('To: whom it may concern', NAMES)).toBe('To: whom it may concern');
  });

  it('masks known display names in free text, including a first-name signature', () => {
    const text = 'Perfect, see you at 10:00.\n\nAlice\nExample Studio\nalice@example.com';
    expect(maskText(text, NAMES)).toBe('Perfect, see you at 10:00.\n\nA•••\nExample Studio\na•••@•••.com');
    expect(maskText('Thanks Alice Example!', NAMES)).toBe('Thanks A••• E•••!');
  });

  it('does not mask a known name inside another word', () => {
    expect(maskText('Malice is not a name here', ['Alice'])).toBe('Malice is not a name here');
  });

  it('reports which segments were masked so the UI can blur only those', () => {
    const segments = maskTextSegments('Hi alice@example.com, see you', []);
    expect(segments).toEqual([
      { text: 'Hi ', masked: false },
      { text: 'a•••@•••.com', masked: true },
      { text: ', see you', masked: false },
    ]);
  });

  it('renders masked runs as escaped .pii spans', () => {
    const html = maskTextToHtml('<b>Alice</b> alice@example.com', ['Alice']);
    expect(html).toBe('&lt;b&gt;<span class="pii">A•••</span>&lt;/b&gt; <span class="pii">a•••@•••.com</span>');
  });
});

describe('collectNames', () => {
  it('collects full names and capitalised first names, longest first', () => {
    const names = collectNames({
      threads: [
        {
          id: 't',
          subject: 's',
          participants: [{ name: 'Alice Example', address: 'alice@example.com' }],
          lastMessageAt: '',
          messages: [
            {
              id: 'm',
              from: { name: 'Marco Rossi', address: 'marco@example.com' },
              to: [{ address: 'x@y.z' }],
              cc: [{ name: 'Bo Li', address: 'bo@example.com' }],
              date: '',
              subject: '',
              attachments: [],
            },
          ],
        },
      ],
    });
    expect(names.slice(0, 2).sort()).toEqual(['Alice Example', 'Marco Rossi']);
    expect(names).toEqual(expect.arrayContaining(['Alice', 'Example', 'Marco', 'Rossi', 'Bo Li']));
    // Full names are always hidden; two-letter fragments would over-mask ordinary prose.
    expect(names).not.toContain('Bo');
    expect(names).not.toContain('Li');
    expect(collectNames(null)).toEqual([]);
  });
});

describe('persistence and the force-on flag', () => {
  it('reads ?blur and only ?blur from the query string', () => {
    expect(readForcedBlur('')).toBe(false);
    expect(readForcedBlur('?demo')).toBe(false);
    expect(readForcedBlur('?blur=1')).toBe(true);
    expect(readForcedBlur('?demo&blur')).toBe(true);
    expect(readForcedBlur('?blur=on')).toBe(true);
    expect(readForcedBlur('?blur=0')).toBe(false);
    expect(readForcedBlur('?blur=off')).toBe(false);
  });

  it('round-trips through storage and survives a throwing storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readStoredBlur(storage)).toBe(false);
    writeStoredBlur(storage, true);
    expect(readStoredBlur(storage)).toBe(true);
    writeStoredBlur(storage, false);
    expect(readStoredBlur(storage)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('private mode');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readStoredBlur(broken)).toBe(false);
    expect(() => writeStoredBlur(broken, true)).not.toThrow();
    expect(readStoredBlur(null)).toBe(false);
  });
});
