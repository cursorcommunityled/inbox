import { useState } from 'react';
import { participantSummary } from '../lib/addresses';
import type { ComposeKind } from '../lib/command';
import type { Draft } from '../lib/compose';
import { countLabel } from '../lib/filterThreads';
import type { Message, Thread } from '../types/inbox';
import { ArchiveIcon, ChevronLeftIcon, ForwardIcon, MailIcon, ReplyAllIcon, ReplyIcon, StarIcon } from './Icons';
import { LabelEditor } from './LabelEditor';
import { CollapsedMessage, MessageCard } from './MessageCard';
import { Pii } from './Privacy';

export function ThreadView({
  thread,
  inboxAddress,
  theme,
  remoteImages,
  inlineOpen,
  starred,
  archived,
  labels,
  labelSuggestions,
  draft,
  onToggleRemote,
  onToggleInline,
  onBack,
  onCompose,
  onResumeDraft,
  onToggleStar,
  onToggleArchive,
  onMarkUnread,
  onAddLabel,
  onRemoveLabel,
}: {
  thread: Thread;
  inboxAddress: string;
  theme: 'light' | 'dark';
  remoteImages: Record<string, boolean>;
  inlineOpen: Record<string, boolean>;
  starred: boolean;
  archived: boolean;
  labels: string[];
  labelSuggestions: string[];
  draft: Draft | undefined;
  onToggleRemote: (id: string) => void;
  onToggleInline: (id: string) => void;
  onBack: () => void;
  onCompose: (kind: ComposeKind, message: Message) => void;
  onResumeDraft: () => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
  onMarkUnread: () => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}) {
  const latest = thread.messages[thread.messages.length - 1];
  const lastId = latest?.id ?? '';
  const [openFor, setOpenFor] = useState(thread.id);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  if (openFor !== thread.id) {
    setOpenFor(thread.id);
    setOpened({});
  }

  const count = countLabel(thread);
  const countText = count.includes('/') ? `${count} messages in this export` : `${count} ${count === '1' ? 'message' : 'messages'}`;

  return (
    <div className="thread-view">
      <div className="read-toolbar" role="toolbar" aria-label="Thread actions">
        <button type="button" className="icon-btn back-btn" onClick={onBack} aria-label="Back to threads">
          <ChevronLeftIcon />
        </button>
        {latest && (
          <>
            <button type="button" className="tool-btn" onClick={() => onCompose('reply', latest)} title="Reply (r)">
              <ReplyIcon />
              <span>Reply</span>
            </button>
            <button type="button" className="tool-btn" onClick={() => onCompose('reply-all', latest)} title="Reply all (a)">
              <ReplyAllIcon />
              <span>Reply all</span>
            </button>
            <button type="button" className="tool-btn" onClick={() => onCompose('forward', latest)} title="Forward (f)">
              <ForwardIcon />
              <span>Forward</span>
            </button>
          </>
        )}
        <span className="tool-spacer" />
        <button
          type="button"
          className={archived ? 'icon-btn is-on' : 'icon-btn'}
          onClick={onToggleArchive}
          aria-pressed={archived}
          aria-label={archived ? 'Move back to inbox' : 'Archive thread'}
          title={`${archived ? 'Unarchive' : 'Archive'} (e)`}
        >
          <ArchiveIcon />
        </button>
        <button type="button" className="icon-btn" onClick={onMarkUnread} aria-label="Mark unread" title="Mark unread (u)">
          <MailIcon />
        </button>
        <button
          type="button"
          className={starred ? 'icon-btn is-on' : 'icon-btn'}
          onClick={onToggleStar}
          aria-pressed={starred}
          aria-label={starred ? 'Unstar thread' : 'Star thread'}
          title={`${starred ? 'Unstar' : 'Star'} (s)`}
        >
          <StarIcon filled={starred} />
        </button>
      </div>
      <div className="message-scroll">
        <header className="read-head">
          <h1>{thread.subject}</h1>
          <p className="read-sub">
            <Pii kind="people">{participantSummary(thread.participants)}</Pii> <span className="dot-sep">·</span> {countText}
            {archived && <span className="state-pill">Archived</span>}
          </p>
          <div className="read-meta">
            <LabelEditor labels={labels} suggestions={labelSuggestions} onAdd={onAddLabel} onRemove={onRemoveLabel} />
            {draft && (
              <button type="button" className="btn btn-small draft-resume" onClick={onResumeDraft}>
                {draft.handedToBotAt ? 'Draft handed to bot' : 'Resume draft'}
              </button>
            )}
          </div>
        </header>
        {thread.messages.length === 0 && <p className="read-empty">This thread has no messages in the export.</p>}
        {thread.messages.map((message) => {
          const showBody = thread.messages.length <= 1 || opened[message.id] || message.id === lastId;
          if (!showBody) {
            return (
              <CollapsedMessage
                key={message.id}
                message={message}
                onOpen={() => setOpened((current) => ({ ...current, [message.id]: true }))}
              />
            );
          }
          return (
            <MessageCard
              key={message.id}
              message={message}
              inboxAddress={inboxAddress}
              theme={theme}
              threadSubject={thread.subject}
              remoteImages={Boolean(remoteImages[message.id])}
              inlineOpen={Boolean(inlineOpen[message.id])}
              onToggleRemote={() => onToggleRemote(message.id)}
              onToggleInline={() => onToggleInline(message.id)}
              onCompose={(kind) => onCompose(kind, message)}
            />
          );
        })}
      </div>
    </div>
  );
}
