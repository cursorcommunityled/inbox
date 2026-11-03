import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { mask, maskParticipant, maskTextSegments, type MaskKind } from '../lib/privacy';
import type { Participant } from '../types/inbox';

export interface PrivacyState {
  /** The privacy blur is on: names and addresses are masked and blurred everywhere. */
  on: boolean;
  /** Display names found in the open export, so free text can hide them too. */
  names: readonly string[];
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyState>({ on: false, names: [], toggle: () => {} });

export function PrivacyProvider({ value, children }: { value: PrivacyState; children: ReactNode }) {
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  const state = useContext(PrivacyContext);
  return useMemo(
    () => ({
      on: state.on,
      names: state.names,
      toggle: state.toggle,
      /** The same participant with name and address masked while the blur is on. */
      person: (participant: Participant): Participant => (state.on ? maskParticipant(participant) : participant),
      /** A string masked by kind while the blur is on; the identity otherwise. */
      text: (kind: MaskKind, value: string): string => (state.on ? mask(kind, value, state.names) : value),
    }),
    [state],
  );
}

/**
 * Inline personal identifier. While the privacy blur is on, the text is
 * replaced by a masked placeholder and the `.pii` class blurs it and makes
 * it unselectable. `name`, `address` and `people` mask the whole string;
 * `text` is free text (a snippet, a body line) where only the addresses,
 * header lines and known names inside it are masked and blurred.
 */
export function Pii({ kind = 'text', children, className }: { kind?: MaskKind; children: string; className?: string }) {
  const { on, names } = usePrivacy();
  if (kind === 'text') {
    if (!on) return <>{children}</>;
    return (
      <>
        {maskTextSegments(children, names).map((segment, index) =>
          segment.masked ? (
            <span key={index} className={className ? `pii ${className}` : 'pii'}>
              {segment.text}
            </span>
          ) : (
            segment.text
          ),
        )}
      </>
    );
  }
  return <span className={className ? `pii ${className}` : 'pii'}>{on ? mask(kind, children, names) : children}</span>;
}
