import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, type PaletteItem } from './components/CommandPalette';
import { ComposeView } from './components/ComposeView';
import { EmptyState } from './components/EmptyState';
import {
  ArchiveIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  FolderOpenIcon,
  ForwardIcon,
  HashIcon,
  InboxIcon,
  KeyboardIcon,
  LogoMark,
  MailIcon,
  MailOpenIcon,
  MoonIcon,
  PenIcon,
  RefreshIcon,
  ReplyAllIcon,
  ReplyIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  StarIcon,
  SunIcon,
  TagIcon,
  TrashIcon,
} from './components/Icons';
import { Pii, PrivacyProvider, type PrivacyState } from './components/Privacy';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sidebar } from './components/Sidebar';
import { SkeletonInbox } from './components/Skeleton';
import { ThreadList } from './components/ThreadList';
import { ThreadView } from './components/ThreadView';
import { useInboxSession } from './hooks/useInboxSession';
import { useLocalInboxState } from './hooks/useLocalInboxState';
import { useMatchMedia } from './hooks/useMatchMedia';
import { usePrivacyBlur } from './hooks/usePrivacyBlur';
import { useTheme } from './hooks/useTheme';
import { participantSummary } from './lib/addresses';
import { collectNames } from './lib/privacy';
import { copyText } from './lib/clipboard';
import { formatRefreshCommand, type ComposeKind, type SendCommand } from './lib/command';
import { draftKey, startDraft, type Draft } from './lib/compose';
import { formatExportTime, formatRelativeTime } from './lib/dates';
import { chooseDelivery, deliverPayload, enqueue, loadQueue, reconcileQueue, saveQueue, type QueuedItem } from './lib/outbox';
import {
  applyPrefill,
  buildRefreshPayload,
  buildSendPayload,
  clearWebhookSettings,
  deliver,
  isConfigured,
  loadWebhookSettings,
  saveWebhookSettings,
  type WebhookSettings,
} from './lib/webhook';
import { FOLDERS, INITIAL_FILTERS, collectPlusTags, filterThreads, type Folder } from './lib/filterThreads';
import { allLabels, isArchived, isStarred, isUnread, threadLabels } from './lib/localInboxState';
import type { Message, Thread } from './types/inbox';

interface Notice {
  message: string;
  tone: 'info' | 'error';
}

export function App() {
  const { theme, toggleTheme } = useTheme();
  const { on: privacyOn, toggle: togglePrivacyBlur } = usePrivacyBlur();
  const narrow = useMatchMedia('(max-width: 840px)');
  const {
    inbox,
    sourceKind,
    sessionId,
    snapshot,
    snapshotKey,
    outbox,
    refreshSnapshot,
    error,
    loading,
    dragging,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    remoteImages,
    inlineOpen,
    openFile,
    openSample,
    forget,
    dismissError,
    toggleRemote,
    toggleInline,
  } = useInboxSession();
  const local = useLocalInboxState(inbox?.inbox ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [compose, setCompose] = useState<Draft | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pillHidden, setPillHidden] = useState(false);
  const [webhook, setWebhook] = useState<WebhookSettings>(() => loadWebhookSettings());
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const webhookReady = isConfigured(webhook);
  const outboxReady = outbox.available && Boolean(snapshotKey);
  const delivery = chooseDelivery({ webhook, outboxKey: snapshotKey, outboxReady: outbox.available });
  const botReady = delivery !== 'copy';

  // The snapshot may carry the bot's webhook URL so the user only pastes the key.
  useEffect(() => {
    if (!inbox?.relay) return;
    setWebhook((current) => {
      const next = applyPrefill(current, inbox.relay);
      if (next !== current) saveWebhookSettings(next);
      return next;
    });
  }, [inbox]);

  // Keeps "updated X min ago" honest without re-rendering every second.
  useEffect(() => {
    if (!snapshot) return;
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [snapshot]);

  const inboxAddress = inbox?.inbox ?? '';

  // Items this device left in the outbox, until a snapshot says the bot took them.
  useEffect(() => {
    setQueue(inboxAddress ? loadQueue(inboxAddress) : []);
  }, [inboxAddress]);

  useEffect(() => {
    if (!inboxAddress || outbox.acked.length === 0) return;
    const { queue: next, handled } = reconcileQueue(queue, outbox.acked);
    if (handled.length === 0) return;
    saveQueue(inboxAddress, next);
    setQueue(next);
    setNotice({
      message:
        handled.length === 1
          ? `Your bot picked up "${handled[0].summary}". Confirm the draft in your Grok Bot chat.`
          : `Your bot picked up ${handled.length} queued drafts. Confirm them in your Grok Bot chat.`,
      tone: 'info',
    });
  }, [inboxAddress, outbox.acked, queue]);

  const visible = useMemo(() => {
    if (!inbox) return [];
    const matched = filterThreads(inbox.threads, filters, local.state, inboxAddress);
    // In the Unread folder the open thread turns read; keep it on screen until you move on.
    if (filters.folder !== 'unread' || !selectedId || matched.some((thread) => thread.id === selectedId)) return matched;
    const pinned = inbox.threads.find((thread) => thread.id === selectedId);
    if (!pinned || filterThreads([pinned], { ...filters, folder: 'inbox' }, local.state, inboxAddress).length === 0) {
      return matched;
    }
    const ids = new Set(matched.map((thread) => thread.id));
    return inbox.threads.filter((thread) => ids.has(thread.id) || thread.id === selectedId);
  }, [inbox, filters, local.state, inboxAddress, selectedId]);
  const tags = useMemo(() => (inbox ? collectPlusTags(inbox) : []), [inbox]);
  const labels = useMemo(() => allLabels(local.state), [local.state]);
  const privacyNames = useMemo(() => collectNames(inbox), [inbox]);
  const counts = useMemo<Record<Folder, number>>(() => {
    const out: Record<Folder, number> = { inbox: 0, unread: 0, starred: 0, archived: 0 };
    for (const thread of inbox?.threads ?? []) {
      const archived = isArchived(thread.id, local.state);
      if (archived) out.archived += 1;
      else out.inbox += 1;
      if (!archived && isUnread(thread, local.state, inboxAddress)) out.unread += 1;
      if (isStarred(thread.id, local.state)) out.starred += 1;
    }
    return out;
  }, [inbox, local.state, inboxAddress]);
  const selected = visible.find((thread) => thread.id === selectedId) ?? null;
  const threadOpen = Boolean(selected) && (!narrow || mobileThread);

  useEffect(() => {
    if (!inbox || !selectedId) return;
    if (visible.some((thread) => thread.id === selectedId)) return;
    setSelectedId(null);
  }, [inbox, visible, selectedId, setSelectedId]);

  useEffect(() => {
    if (selected && threadOpen) local.markRead(selected);
  }, [selected, threadOpen, local]);

  // Only on a user-initiated open. A background snapshot refresh changes
  // `inbox` too, and must not close a half-written reply.
  useEffect(() => {
    setMobileThread(false);
    setCompose(null);
    setPillHidden(false);
  }, [sessionId]);

  // The tab title is on screen during a share too, so it drops the address while the blur is on.
  useEffect(() => {
    const unread = counts.unread > 0 ? `(${counts.unread}) ` : '';
    document.title = inbox ? `${unread}${privacyOn ? 'Inbox' : inbox.inbox} · Grok Bot Inbox` : 'Grok Bot Inbox';
  }, [inbox, counts.unread, privacyOn]);

  useEffect(() => {
    if (!notice || notice.tone === 'error') return;
    const timer = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toast = useCallback((message: string, tone: 'info' | 'error' = 'info') => setNotice({ message, tone }), []);

  const togglePrivacy = useCallback(() => {
    togglePrivacyBlur();
    if (privacyOn) toast('Names and emails shown again.');
    else toast(narrow ? 'Names and emails hidden.' : 'Names and emails hidden. Press b to show them.');
  }, [togglePrivacyBlur, privacyOn, narrow, toast]);
  const privacy = useMemo<PrivacyState>(() => ({ on: privacyOn, names: privacyNames, toggle: togglePrivacy }), [privacyOn, privacyNames, togglePrivacy]);
  const privacyLabel = privacyOn ? 'Show names and emails' : 'Hide names and emails';

  const openCompose = useCallback(
    (kind: ComposeKind, thread?: Thread, message?: Message) => {
      if (!inbox) return;
      const key = draftKey(kind, thread?.id);
      const existing = local.state.drafts[key];
      if (existing && (existing.body.trim() || existing.handedToBotAt || kind === 'new')) {
        setCompose(existing);
        if (existing.body.trim()) toast(existing.handedToBotAt ? 'This draft was already handed to your bot.' : 'Resumed your draft.');
        return;
      }
      const draft = startDraft(kind, inbox.inbox, thread, message);
      local.saveDraft(draft);
      setCompose(draft);
    },
    [inbox, local, toast],
  );

  const closeCompose = useCallback(
    (draft: Draft) => {
      const untouched = !draft.body.trim() && !draft.handedToBotAt && (draft.kind !== 'new' || (!draft.to && !draft.subject));
      if (untouched) local.discardDraft(draft.id);
      setCompose(null);
    },
    [local],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((thread) => thread.id === selectedId);
      const next = visible[index < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, index + delta))];
      if (next) setSelectedId(next.id);
    },
    [visible, selectedId, setSelectedId],
  );

  const archiveSelected = useCallback(() => {
    if (!selected) return;
    const index = visible.findIndex((thread) => thread.id === selected.id);
    const next = visible[index + 1] ?? visible[index - 1] ?? null;
    const wasArchived = isArchived(selected.id, local.state);
    local.toggleArchive(selected.id);
    toast(wasArchived ? 'Moved back to Inbox.' : 'Archived (stays in this browser).');
    if (narrow) setMobileThread(false);
    if (filters.folder !== 'starred') setSelectedId(next ? next.id : null);
  }, [selected, visible, local, toast, narrow, filters.folder, setSelectedId]);

  const markUnreadSelected = useCallback(() => {
    if (!selected) return;
    local.markUnread(selected.id);
    if (narrow) setMobileThread(false);
    else setSelectedId(null);
  }, [selected, local, narrow, setSelectedId]);

  const copyRefresh = useCallback(async () => {
    if (!inbox) return;
    const ok = await copyText(formatRefreshCommand(inbox.inbox));
    toast(
      ok ? 'Copied /inbox-refresh, paste it in your bot chat for a fresh link.' : 'Could not copy. Type /inbox-refresh in your bot chat.',
      ok ? 'info' : 'error',
    );
  }, [inbox, toast]);

  /**
   * Refresh, best path first: re-check the encrypted snapshot, then ask the
   * bot over the webhook to publish a new one, and only then fall back to
   * the copy-and-paste command.
   */
  const refresh = useCallback(async () => {
    if (!inbox) return;
    if (snapshot) {
      const changed = await refreshSnapshot(true);
      if (changed) {
        toast('Inbox updated from your bot\'s latest snapshot.');
        return;
      }
    }
    if (webhookReady) {
      const result = await deliver(buildRefreshPayload(inbox.inbox), webhook);
      if (result.ok) {
        toast(snapshot ? 'Asked your bot to publish a fresh snapshot. It appears here when ready.' : 'Asked your bot for a fresh export. Check your Grok Bot chat.');
        return;
      }
      toast(`${result.error ?? 'The bot could not be reached.'} Copying /inbox-refresh instead.`, 'error');
    }
    if (snapshot && !webhookReady) {
      toast('Already up to date with the latest published snapshot.');
      return;
    }
    await copyRefresh();
  }, [inbox, snapshot, refreshSnapshot, webhookReady, webhook, toast, copyRefresh]);

  /** Webhook when configured (instant), else the encrypted outbox; the compose window copies the block when neither works. */
  const deliverSend = useCallback(
    async (command: Omit<SendCommand, 'version'>, commandText: string) => {
      const payload = buildSendPayload(command, commandText);
      const outcome = await deliverPayload(payload, { webhook, outboxKey: snapshotKey, outboxReady: outbox.available });
      if (outcome.ok && outcome.via === 'outbox' && outcome.id && inboxAddress) {
        setQueue((current) => {
          const next = enqueue(current, payload, outcome.id!);
          saveQueue(inboxAddress, next);
          return next;
        });
      }
      return outcome;
    },
    [webhook, snapshotKey, outbox.available, inboxAddress],
  );

  const saveWebhook = useCallback(
    (next: WebhookSettings) => {
      setWebhook(next);
      saveWebhookSettings(next);
      toast(isConfigured(next) ? 'Webhook saved on this device. "Send with my bot" now posts directly.' : 'Settings saved.');
    },
    [toast],
  );

  const clearWebhook = useCallback(() => {
    clearWebhookSettings();
    setWebhook(loadWebhookSettings());
  }, []);

  const clearQueue = useCallback(() => {
    if (inboxAddress) saveQueue(inboxAddress, []);
    setQueue([]);
  }, [inboxAddress]);

  const snapshotLabel = useMemo(() => {
    if (!snapshot) return '';
    const relative = formatRelativeTime(snapshot.updatedAt, new Date(clock));
    return relative ? `updated ${relative}` : '';
  }, [snapshot, clock]);

  const openThread = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMobileThread(true);
    },
    [setSelectedId],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowPalette((open) => !open);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      if (event.key === 'Escape') {
        if (showPalette) setShowPalette(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (showSettings) setShowSettings(false);
        else if (compose) closeCompose(compose);
        else if (typing) (target as HTMLElement).blur();
        return;
      }
      if (typing || showPalette) return;
      if (event.key === '?') {
        event.preventDefault();
        setShowShortcuts((open) => !open);
        return;
      }
      if (showShortcuts || showSettings || compose) return;
      if (event.key === 'b') {
        event.preventDefault();
        togglePrivacy();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        const search = document.getElementById('mail-search');
        if (search) search.focus();
        else setShowPalette(true);
        return;
      }
      if (!inbox) return;
      const latest = selected?.messages[selected.messages.length - 1];
      switch (event.key) {
        case 'j':
          moveSelection(1);
          break;
        case 'k':
          moveSelection(-1);
          break;
        case 'Enter':
          if (selected && narrow) setMobileThread(true);
          break;
        case 'c':
          openCompose('new');
          break;
        case 'r':
          if (selected && latest) openCompose('reply', selected, latest);
          break;
        case 'a':
          if (selected && latest) openCompose('reply-all', selected, latest);
          break;
        case 'f':
          if (selected && latest) openCompose('forward', selected, latest);
          break;
        case 'e':
          archiveSelected();
          break;
        case 's':
          if (selected) local.toggleStar(selected.id);
          break;
        case 'u':
          markUnreadSelected();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    inbox,
    selected,
    narrow,
    compose,
    showShortcuts,
    showSettings,
    showPalette,
    closeCompose,
    moveSelection,
    openCompose,
    archiveSelected,
    markUnreadSelected,
    togglePrivacy,
    local,
  ]);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    const latest = selected?.messages[selected.messages.length - 1];
    if (inbox) {
      items.push({ id: 'compose', label: 'New message', group: 'Actions', shortcut: 'c', icon: <PenIcon />, run: () => openCompose('new') });
      if (selected && latest) {
        items.push(
          { id: 'reply', label: 'Reply', group: 'Actions', shortcut: 'r', icon: <ReplyIcon />, run: () => openCompose('reply', selected, latest) },
          { id: 'reply-all', label: 'Reply all', group: 'Actions', shortcut: 'a', icon: <ReplyAllIcon />, run: () => openCompose('reply-all', selected, latest) },
          { id: 'forward', label: 'Forward', group: 'Actions', shortcut: 'f', icon: <ForwardIcon />, run: () => openCompose('forward', selected, latest) },
          {
            id: 'archive',
            label: isArchived(selected.id, local.state) ? 'Move back to Inbox' : 'Archive thread',
            group: 'Actions',
            shortcut: 'e',
            icon: <ArchiveIcon />,
            run: archiveSelected,
          },
          {
            id: 'star',
            label: isStarred(selected.id, local.state) ? 'Unstar thread' : 'Star thread',
            group: 'Actions',
            shortcut: 's',
            icon: <StarIcon />,
            run: () => local.toggleStar(selected.id),
          },
          { id: 'unread', label: 'Mark unread', group: 'Actions', shortcut: 'u', icon: <MailOpenIcon />, run: markUnreadSelected },
        );
      }
      items.push({
        id: 'refresh',
        label: snapshot ? 'Check for a newer snapshot' : 'Refresh via your bot',
        hint: snapshot ? snapshotLabel || undefined : webhookReady ? 'asks your bot over the webhook' : 'copies /inbox-refresh',
        group: 'Actions',
        keywords: 'reload export link update',
        icon: <RefreshIcon />,
        run: () => void refresh(),
      });
      for (const folder of FOLDERS) {
        items.push({
          id: `folder-${folder.id}`,
          label: `Go to ${folder.label}`,
          hint: counts[folder.id] ? String(counts[folder.id]) : undefined,
          group: 'Folders',
          keywords: 'folder view',
          icon: folder.id === 'inbox' ? <InboxIcon /> : folder.id === 'unread' ? <MailIcon /> : folder.id === 'starred' ? <StarIcon /> : <ArchiveIcon />,
          run: () => setFilters({ ...filters, folder: folder.id, query: '' }),
        });
      }
      for (const label of labels) {
        items.push({
          id: `label-${label}`,
          label: `Label: ${label}`,
          group: 'Labels',
          icon: <TagIcon />,
          run: () => setFilters({ ...filters, label: filters.label === label ? null : label }),
        });
      }
      for (const tag of tags) {
        items.push({
          id: `tag-${tag}`,
          label: `Address: +${tag}`,
          group: 'Addresses',
          icon: <HashIcon />,
          run: () => setFilters({ ...filters, tag: filters.tag === tag ? null : tag }),
        });
      }
      for (const thread of inbox.threads.slice(0, 400)) {
        items.push({
          id: `thread-${thread.id}`,
          label: thread.subject || '(no subject)',
          hint: <Pii kind="people">{participantSummary(thread.participants, 2)}</Pii>,
          group: 'Threads',
          keywords: thread.participants.map((p) => `${p.name ?? ''} ${p.address}`).join(' '),
          icon: <MailIcon />,
          run: () => {
            const visibleNow = filterThreads([thread], filters, local.state, inboxAddress).length > 0;
            if (!visibleNow) {
              setFilters({
                ...INITIAL_FILTERS,
                folder: isArchived(thread.id, local.state) ? 'archived' : 'inbox',
              });
            }
            openThread(thread.id);
          },
        });
      }
    }
    items.push(
      {
        id: 'privacy',
        label: privacyLabel,
        hint: privacyOn ? 'privacy blur is on' : 'for screen shares and demos',
        group: 'Settings',
        shortcut: 'b',
        keywords: 'privacy blur demo mask hide names emails addresses redact',
        icon: privacyOn ? <EyeIcon /> : <EyeOffIcon />,
        run: togglePrivacy,
      },
      { id: 'theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', group: 'Settings', icon: theme === 'dark' ? <SunIcon /> : <MoonIcon />, run: toggleTheme },
      { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Settings', shortcut: '?', icon: <KeyboardIcon />, run: () => setShowShortcuts(true) },
      {
        id: 'settings',
        label: 'Settings',
        hint: webhookReady ? 'webhook connected' : outboxReady ? (queue.length ? `outbox ready · ${queue.length} waiting` : 'outbox ready') : 'connect your bot\'s webhook',
        group: 'Settings',
        keywords: 'webhook key relay device outbox queued waiting',
        icon: <SettingsIcon />,
        run: () => setShowSettings(true),
      },
      { id: 'open', label: 'Open export file…', group: 'Settings', icon: <FolderOpenIcon />, run: () => fileRef.current?.click() },
    );
    if (!inbox) items.push({ id: 'sample', label: 'Load sample inbox', group: 'Settings', icon: <SparkIcon />, run: openSample });
    if (inbox && sourceKind === 'link') {
      items.push({ id: 'forget', label: 'Forget this inbox', hint: 'clears it from this tab', group: 'Settings', icon: <TrashIcon />, run: forget });
    }
    if (inbox && sourceKind === 'snapshot') {
      items.push({ id: 'forget', label: 'Forget this device', hint: 'removes the decryption key', group: 'Settings', icon: <TrashIcon />, run: forget });
    }
    return items;
  }, [
    inbox,
    selected,
    local,
    labels,
    tags,
    filters,
    counts,
    theme,
    privacyOn,
    privacyLabel,
    sourceKind,
    snapshot,
    snapshotLabel,
    webhookReady,
    outboxReady,
    queue.length,
    inboxAddress,
    openCompose,
    archiveSelected,
    markUnreadSelected,
    refresh,
    setFilters,
    openThread,
    toggleTheme,
    togglePrivacy,
    openSample,
    forget,
  ]);

  const pane = narrow && mobileThread && selected ? 'thread' : 'list';

  return (
    <PrivacyProvider value={privacy}>
      <div className="app">
        <a className="skip" href="#mailbox">
          Skip to mail
        </a>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept=".json,.txt,application/json,text/plain"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) openFile(file);
          }}
        />

        {inbox && (
          <header className="mobile-bar">
            <div className="sidebar-brand">
              <LogoMark size={24} />
              <span className="brand-name">Inbox</span>
            </div>
            <span className="mono mobile-address" title={privacyOn ? undefined : inbox.inbox}>
              <Pii kind="address">{inbox.inbox}</Pii>
            </span>
            <button
              type="button"
              className={privacyOn ? 'icon-btn privacy-toggle is-on' : 'icon-btn privacy-toggle'}
              onClick={togglePrivacy}
              aria-pressed={privacyOn}
              aria-label={privacyLabel}
              title={`${privacyLabel} (b)`}
            >
              {privacyOn ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button type="button" className="icon-btn" onClick={() => setShowPalette(true)} aria-label="Search and commands">
              <SearchIcon />
            </button>
            <button type="button" className="icon-btn is-primary" onClick={() => openCompose('new')} aria-label="New message">
              <PenIcon />
            </button>
          </header>
        )}

        {loading && !inbox ? (
          <SkeletonInbox />
        ) : inbox ? (
          <div className="workspace" id="mailbox" data-show={narrow ? pane : 'all'}>
            <Sidebar
              inboxAddress={inbox.inbox}
              filters={filters}
              counts={counts}
              labels={labels}
              tags={tags}
              theme={theme}
              exportedLabel={formatExportTime(inbox.exportedAt)}
              lite={inbox.mode === 'lite'}
              live={snapshot ? { label: snapshotLabel, refreshing: snapshot.refreshing, stale: snapshot.stale } : null}
              queued={queue.length}
              privacyOn={privacyOn}
              onFilters={setFilters}
              onCompose={() => openCompose('new')}
              onRefresh={() => void refresh()}
              onToggleTheme={toggleTheme}
              onTogglePrivacy={togglePrivacy}
              onShortcuts={() => setShowShortcuts(true)}
              onSettings={() => setShowSettings(true)}
            />
            <ThreadList
              threads={visible}
              total={inbox.threads.length}
              inboxAddress={inbox.inbox}
              selectedId={selected?.id ?? null}
              filters={filters}
              state={local.state}
              onFilters={setFilters}
              onSelect={setSelectedId}
              onOpen={openThread}
              onToggleStar={local.toggleStar}
              onPalette={() => setShowPalette(true)}
            />
            <section className="pane read-pane" aria-label="Conversation">
              {selected ? (
                <ThreadView
                  thread={selected}
                  inboxAddress={inbox.inbox}
                  theme={theme}
                  remoteImages={remoteImages}
                  inlineOpen={inlineOpen}
                  starred={isStarred(selected.id, local.state)}
                  archived={isArchived(selected.id, local.state)}
                  labels={threadLabels(selected.id, local.state)}
                  labelSuggestions={labels}
                  draft={local.state.drafts[draftKey('reply', selected.id)]}
                  onToggleRemote={toggleRemote}
                  onToggleInline={toggleInline}
                  onBack={() => setMobileThread(false)}
                  onCompose={(kind, message) => openCompose(kind, selected, message)}
                  onResumeDraft={() => {
                    const draft = local.state.drafts[draftKey('reply', selected.id)];
                    if (draft) setCompose(draft);
                  }}
                  onToggleStar={() => local.toggleStar(selected.id)}
                  onToggleArchive={archiveSelected}
                  onMarkUnread={markUnreadSelected}
                  onAddLabel={(label) => local.addLabel(selected.id, label)}
                  onRemoveLabel={(label) => local.removeLabel(selected.id, label)}
                />
              ) : (
                <div className="read-hint">
                  <LogoMark size={36} />
                  <p>Select a thread to read it.</p>
                  <p className="fine-print">
                    <kbd>⌘K</kbd> commands · <kbd>c</kbd> compose · <kbd>?</kbd> shortcuts
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="workspace is-empty" id="mailbox">
            <EmptyState loading={loading} onOpen={() => fileRef.current?.click()} onSample={openSample} />
            <div className="empty-foot">
              <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>
        )}

        {inbox && (sourceKind === 'link' || sourceKind === 'snapshot') && !pillHidden && (
          <div className="privacy-pill" role="status">
            <span className="pill-dot" aria-hidden="true" />
            <span>
              {sourceKind === 'snapshot' ? (
                <>
                  Decrypted only in your browser. The <code>#k</code> key was removed from the address bar and kept on this device.
                </>
              ) : (
                <>
                  Loaded only in your browser. The <code>#data</code> link was removed from the address bar.
                </>
              )}
            </span>
            <button type="button" className="pill-link" onClick={forget}>
              {sourceKind === 'snapshot' ? 'Forget this device' : 'Forget'}
            </button>
            <button type="button" className="pill-close" onClick={() => setPillHidden(true)} aria-label="Hide">
              <CloseIcon />
            </button>
          </div>
        )}

        {compose && inbox && (
          <ComposeView
            key={compose.id}
            draft={compose}
            inboxAddress={inbox.inbox}
            onChange={(draft) => {
              setCompose(draft);
              local.saveDraft(draft);
            }}
            onHanded={(draft) => {
              local.saveDraft(draft);
              setCompose(null);
            }}
            onDiscard={() => {
              local.discardDraft(compose.id);
              setCompose(null);
            }}
            onClose={() => closeCompose(compose)}
            onToast={toast}
            delivery={delivery}
            onDeliver={botReady ? deliverSend : undefined}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {showPalette && (
          <CommandPalette
            items={paletteItems}
            onClose={() => setShowPalette(false)}
            onSearch={(query) => setFilters({ ...filters, query })}
          />
        )}
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
        {showSettings && (
          <SettingsModal
            settings={webhook}
            snapshot={snapshot}
            outboxReady={outboxReady}
            queue={queue}
            prefilledUrl={inbox?.relay?.webhookUrl}
            onSave={saveWebhook}
            onClear={clearWebhook}
            onClearQueue={clearQueue}
            onForgetDevice={sourceKind === 'snapshot' ? forget : undefined}
            onClose={() => setShowSettings(false)}
          />
        )}

        {dragging && (
          <div className="drop-overlay">
            <div className="drop-card">
              <strong>Drop the JSON export</strong>
              <p>It opens locally. Nothing is uploaded.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="toast is-error" role="alert">
            <p>{error}</p>
            <button type="button" className="toast-btn" onClick={dismissError}>
              Dismiss
            </button>
          </div>
        )}
        {notice && !error && (
          <div className={notice.tone === 'error' ? 'toast is-error' : 'toast'} role="status">
            <p>{notice.message}</p>
            <button type="button" className="toast-btn" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </PrivacyProvider>
  );
}