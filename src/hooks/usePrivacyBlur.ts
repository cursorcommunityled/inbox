import { useCallback, useEffect, useRef, useState } from 'react';
import { readForcedBlur, readStoredBlur, writeStoredBlur } from '../lib/privacy';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Off by default; `?blur=1` forces it on for this visit, otherwise the last choice on this device wins. */
export function initialPrivacyBlur(): boolean {
  return readForcedBlur(window.location.search) || readStoredBlur(storage());
}

/**
 * The privacy blur switch. The root `data-privacy` attribute drives the CSS,
 * so one toggle covers every `.pii` span and `.pii-field` input at once.
 */
export function usePrivacyBlur() {
  const [on, setOn] = useState<boolean>(initialPrivacyBlur);
  const chosen = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.privacy = on ? 'on' : 'off';
    if (chosen.current) writeStoredBlur(storage(), on);
  }, [on]);

  const toggle = useCallback(() => {
    chosen.current = true;
    setOn((current) => !current);
  }, []);

  return { on, toggle };
}
