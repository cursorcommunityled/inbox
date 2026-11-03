import { useMemo } from 'react';
import { maskTextToHtml } from '../lib/privacy';
import { linkifyToHtml, splitQuotedText } from '../lib/text';
import { usePrivacy } from './Privacy';

export function TextBody({ text }: { text: string }) {
  const { on, names } = usePrivacy();
  const segments = useMemo(() => {
    // While the blur is on, addresses, "On … wrote:" lines and known names come out as blurred `.pii` runs.
    const render = on ? (plain: string) => maskTextToHtml(plain, names) : undefined;
    return splitQuotedText(text).map((segment) => ({ ...segment, html: linkifyToHtml(segment.content, render) }));
  }, [text, on, names]);
  return (
    <div className="text-body">
      {segments.map((segment, index) =>
        segment.type === 'quote' ? (
          <details key={index} className="quoted-reply">
            <summary>Quoted text</summary>
            <div className="text-pre" dangerouslySetInnerHTML={{ __html: segment.html }} />
          </details>
        ) : (
          <div key={index} className="text-pre" dangerouslySetInnerHTML={{ __html: segment.html }} />
        ),
      )}
    </div>
  );
}
