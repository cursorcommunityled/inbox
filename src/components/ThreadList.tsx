import { useEffect, type KeyboardEvent } from 'react';
import { shortName, summaryParticipants, threadCounterpart } from '../lib/addresses';
import { threadHasFileAttachment } from '../lib/attachments';
import { formatThreadTime } from '../lib/dates';
import { FOLDERS, countLabel, messageSnippet, type DirectionFilter, type ThreadFilters } from '../lib/filterThreads';
import { draftForThread, isStarred, isUnread, threadLabels, type LocalInboxState } from '../lib/localInboxState';
import type { Thread } from '../types/inbox';
import { Avatar } from './Avatar';
import { PaperclipIcon, SearchIcon, StarIcon } from './Icons';
import { Pii } from './Privacy';

const DIRECTIONS: { id: DirectionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'sent', label: 'Sent' },
];

export function ThreadList({
  threads,
  total,
  inboxAddress,
  selectedId,
  filters,
  state,
  onFilters,
  onSelect,
  onOpen,
  onToggleStar,
  onPalette,
}: {
  threads: Thread[];
  total: number;
  inboxAddress: string;
  selectedId: string | null;
  filters: ThreadFilters;
  state: LocalInboxState;
  onFilters: (filters: ThreadFilters) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onToggleStar: (id: string) => void;
  onPalette: () => void;
}) {
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`thread-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = threads.findIndex((thread) => thread.id === selectedId);
    const nextIndex = event.key === 'ArrowDown' ? Math.min(threads.length - 1, index + 1) : Math.max(0, index - 1);
    const next = threads[nextIndex];
    if (!next) return;
    onSelect(next.id);
    document.getElementById(`thread-${next.id}`)?.focus();
  }

  const folderLabel = FOLDERS.find((f) => f.id === filters.folder)?.label ?? 'Inbox';
  const scope = [filters.label, filters.tag ? `+${filters.tag}` : null].filter(Boolean).join(' · ');
  const countText = threads.length === total ? `${total}` : `${threads.length} of ${total}`;

  return (
    <section className="pane list-pane" aria-label="Threads">
      <div className="list-head">
        <div className="folder-strip" role="tablist" aria-label="Folders">
          {FOLDERS.map((folder) => (
            <button
              key={folder.id}
              type="button"
              role="tab"
              aria-selected={filters.folder === folder.id}
              className={filters.folder === folder.id ? 'strip-item is-on' : 'strip-item'}
              onClick={() => onFilters({ ...filters, folder: folder.id })}
            >
              {folder.label}
            </button>
          ))}
        </div>
        <label className="search">
          <SearchIcon />
          <input
            id="mail-search"
            type="search"
            placeholder={`Search ${folderLabel.toLowerCase()}`}
            aria-label="Search mail"
            value={filters.query}
            onChange={(event) => onFilters({ ...filters, query: event.target.value })}
          />
          <button type="button" className="search-kbd" onClick={onPalette} aria-label="Open command palette" title="Command palette">
            <kbd>⌘K</kbd>
          </button>
        </label>
        <div className="list-sub">
          <h2 className="list-title">
            {folderLabel}
            {scope && <span className="list-scope"> · {scope}</span>}
          </h2>
          <div className="segment" role="radiogroup" aria-label="Direction">
            {DIRECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={filters.direction === item.id}
                className={filters.direction === item.id ? 'is-on' : undefined}
                onClick={() => onFilters({ ...filters, direction: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="list-count mono" aria-live="polite">
            {countText}
          </span>
        </div>
      </div>
      <div className="thread-scroll" onKeyDown={onKeyDown}>
        {threads.length === 0 ? (
          <div className="list-empty">
            <p>Nothing here.</p>
            <p className="fine-print">
              {filters.query ? 'Try another search, or press ' : 'Press '}
              <kbd>⌘K</kbd> to jump anywhere.
            </p>
          </div>
        ) : (
          threads.map((thread) => {
            const active = thread.id === selectedId;
            const latest = thread.messages[thread.messages.length - 1];
            const who = threadCounterpart(thread, inboxAddress);
            const unread = isUnread(thread, state, inboxAddress);
            const starred = isStarred(thread.id, state);
            const draft = draftForThread(thread.id, state);
            const rowLabels = threadLabels(thread.id, state);
            const people = summaryParticipants(thread, inboxAddress);
            const senderLine = people.length <= 1 ? shortName(who) : people.map(shortName).slice(0, 3).join(', ');
            const className = ['thread-row', active && 'is-active', unread && 'is-unread'].filter(Boolean).join(' ');
            return (
              <div key={thread.id} className={className}>
                <button
                  id={`thread-${thread.id}`}
                  type="button"
                  className="thread-open"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onOpen(thread.id)}
                >
                  <span className="row-dot" aria-hidden="true" />
                  <Avatar participant={who} />
                  <span className="thread-main">
                    <span className="row-top">
                      <span className="row-sender">
                        <Pii kind="people">{senderLine}</Pii>
                        {unread && <span className="sr-only"> (unread)</span>}
                      </span>
                      <span className="row-right">
                        {threadHasFileAttachment(thread) && (
                          <span className="clip" title="Has files">
                            <PaperclipIcon />
                          </span>
                        )}
                        {thread.messages.length > 1 && <span className="row-count mono">{countLabel(thread)}</span>}
                        <time className="row-time mono" dateTime={thread.lastMessageAt || undefined}>
                          {formatThreadTime(thread.lastMessageAt)}
                        </time>
                      </span>
                    </span>
                    <span className="row-subject">{thread.subject}</span>
                    <span className="row-snippet">
                      {draft && <span className="draft-mark">{draft.handedToBotAt ? 'Handed to bot' : 'Draft'} · </span>}
                      {latest && <Pii kind="text">{messageSnippet(latest)}</Pii>}
                    </span>
                    {rowLabels.length > 0 && (
                      <span className="row-labels">
                        {rowLabels.map((label) => (
                          <span key={label} className="label-chip is-small">
                            {label}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className={starred ? 'star-btn is-on' : 'star-btn'}
                  aria-pressed={starred}
                  aria-label={starred ? `Unstar ${thread.subject}` : `Star ${thread.subject}`}
                  onClick={() => onToggleStar(thread.id)}
                >
                  <StarIcon filled={starred} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
