import { addressesEqual, formatParticipant, shortName } from '../lib/addresses';
import type { ComposeKind } from '../lib/command';
import { formatMessageTime, formatThreadTime } from '../lib/dates';
import { effectiveDirection, messageSnippet } from '../lib/filterThreads';
import { htmlHasRemoteImages } from '../lib/sanitizeHtml';
import type { Message } from '../types/inbox';
import { AttachmentList } from './AttachmentList';
import { Avatar } from './Avatar';
import { HtmlBody } from './HtmlBody';
import { ForwardIcon, ReplyAllIcon, ReplyIcon } from './Icons';
import { Pii, usePrivacy } from './Privacy';
import { TextBody } from './TextBody';

export function CollapsedMessage({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const privacy = usePrivacy();
  const label = shortName(message.from);
  return (
    <button
      type="button"
      className="message-collapsed"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Show message from ${privacy.text('name', label)}`}
    >
      <Avatar participant={message.from} />
      <span className="collapsed-name">
        <Pii kind="name">{label}</Pii>
      </span>
      <span className="row-snippet">
        <Pii kind="text">{messageSnippet(message) || 'Empty message'}</Pii>
      </span>
      <time className="mono" dateTime={message.date || undefined}>
        {message.date ? formatThreadTime(message.date) : ''}
      </time>
    </button>
  );
}

export function MessageCard({
  message,
  inboxAddress,
  theme,
  remoteImages,
  inlineOpen,
  onToggleRemote,
  onToggleInline,
  onCompose,
  threadSubject,
}: {
  message: Message;
  inboxAddress: string;
  theme: 'light' | 'dark';
  remoteImages: boolean;
  inlineOpen: boolean;
  onToggleRemote: () => void;
  onToggleInline: () => void;
  onCompose: (kind: ComposeKind) => void;
  threadSubject: string;
}) {
  const isYou = addressesEqual(message.from.address, inboxAddress);
  const label = shortName(message.from);
  const showAddress = Boolean(message.from.name && message.from.address);
  const direction = effectiveDirection(message);
  const showSubject = message.subject.trim() && message.subject.trim() !== threadSubject.trim();
  const html = message.html?.trim();
  const text = message.text ?? '';
  const hasRemote = Boolean(html && htmlHasRemoteImages(html));
  const toLine = message.to.map(formatParticipant).join(', ');
  const ccLine = (message.cc ?? []).map(formatParticipant).join(', ');

  return (
    <article className="message" id={`message-${message.id}`}>
      <header className="message-head">
        <Avatar participant={message.from} />
        <div className="message-who">
          <div className="message-from">
            <strong>
              <Pii kind="name">{label}</Pii>
            </strong>
            {showAddress && (
              <span className="message-address mono">
                <Pii kind="address">{message.from.address}</Pii>
              </span>
            )}
            {isYou && <span className="you-pill">You</span>}
            {direction === 'sent' && !isYou && <span className="you-pill">Sent</span>}
          </div>
          {(toLine || ccLine) && (
            <p className="recipients">
              {toLine && (
                <>
                  <span className="recipients-label">to</span>
                  <span className="mono">
                    <Pii kind="people">{toLine}</Pii>
                  </span>
                </>
              )}
              {ccLine && (
                <>
                  <span className="recipients-label">cc</span>
                  <span className="mono">
                    <Pii kind="people">{ccLine}</Pii>
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="message-side">
          <time className="message-time mono" dateTime={message.date || undefined} title={message.date}>
            {message.date ? formatMessageTime(message.date) : 'Unknown time'}
          </time>
          <div className="message-actions" aria-label="Message actions">
            <button type="button" className="icon-btn is-small" onClick={() => onCompose('reply')} aria-label="Reply" title="Reply">
              <ReplyIcon />
            </button>
            <button type="button" className="icon-btn is-small" onClick={() => onCompose('reply-all')} aria-label="Reply all" title="Reply all">
              <ReplyAllIcon />
            </button>
            <button type="button" className="icon-btn is-small" onClick={() => onCompose('forward')} aria-label="Forward" title="Forward">
              <ForwardIcon />
            </button>
          </div>
        </div>
      </header>
      {showSubject && <p className="message-subject">{message.subject}</p>}
      <div className="message-body">
        {html ? (
          <>
            {hasRemote && (
              <button type="button" className="inline-toggle remote-toggle" onClick={onToggleRemote}>
                {remoteImages ? 'Hide remote images' : 'Load remote images'}
              </button>
            )}
            <HtmlBody html={html} allowRemoteImages={remoteImages} theme={theme} />
          </>
        ) : text.trim() ? (
          <TextBody text={text} />
        ) : (
          <p className="fine-print">No body in this export.</p>
        )}
        <AttachmentList attachments={message.attachments} inlineOpen={inlineOpen} onToggleInline={onToggleInline} />
      </div>
    </article>
  );
}
