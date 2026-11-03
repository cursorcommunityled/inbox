import { useMemo } from 'react';
import { buildEmailSrcDoc, EMAIL_IFRAME_SANDBOX, type EmailFrameOptions } from '../lib/sanitizeHtml';
import { usePrivacy } from './Privacy';

export function HtmlBody({ html, allowRemoteImages, theme }: { html: string } & Omit<EmailFrameOptions, 'privacyNames'>) {
  const { on, names } = usePrivacy();
  const srcDoc = useMemo(
    () => buildEmailSrcDoc(html, { allowRemoteImages, theme, privacyNames: on ? names : undefined }),
    [html, allowRemoteImages, theme, on, names],
  );

  return (
    <iframe
      className="html-frame"
      sandbox={EMAIL_IFRAME_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      title="Sanitized email HTML"
      onLoad={(event) => fitEmailFrame(event.currentTarget)}
    />
  );
}

function fitEmailFrame(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.style.height = '240px';
      return;
    }
    const fit = () => {
      const height = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0);
      iframe.style.height = `${Math.max(height, 48)}px`;
    };
    fit();
    for (const image of Array.from(doc.images)) {
      image.addEventListener('load', fit, { once: true });
    }
    window.setTimeout(fit, 60);
  } catch {
    iframe.style.height = '240px';
  }
}
