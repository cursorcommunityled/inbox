import { initials } from '../lib/addresses';
import type { Participant } from '../types/inbox';
import { usePrivacy } from './Privacy';

/** Monochrome avatar; a tiny per-address tone shift keeps rows scannable without colour. */
export function Avatar({ participant }: { participant: Participant }) {
  const { on } = usePrivacy();
  const key = participant.address || participant.name || '?';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return (
    <span className="avatar" data-tone={hash % 4} aria-hidden="true">
      {/* Initials are a name too: a neutral glyph takes their place while the blur is on. */}
      <span className="pii">{on ? '··' : initials(participant)}</span>
    </span>
  );
}
