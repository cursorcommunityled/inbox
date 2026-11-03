import { FOLDERS, type Folder, type ThreadFilters } from '../lib/filterThreads';
import {
  ArchiveIcon,
  EyeIcon,
  EyeOffIcon,
  HashIcon,
  InboxIcon,
  KeyboardIcon,
  LogoMark,
  MailIcon,
  MoonIcon,
  PenIcon,
  RefreshIcon,
  SettingsIcon,
  StarIcon,
  SunIcon,
  TagIcon,
} from './Icons';
import { Pii } from './Privacy';

const FOLDER_ICONS: Record<Folder, React.ReactNode> = {
  inbox: <InboxIcon />,
  unread: <MailIcon />,
  starred: <StarIcon />,
  archived: <ArchiveIcon />,
};

export function Sidebar({
  inboxAddress,
  filters,
  counts,
  labels,
  tags,
  theme,
  exportedLabel,
  lite,
  live,
  queued = 0,
  privacyOn,
  onFilters,
  onCompose,
  onRefresh,
  onToggleTheme,
  onTogglePrivacy,
  onShortcuts,
  onSettings,
}: {
  inboxAddress: string;
  filters: ThreadFilters;
  counts: Record<Folder, number>;
  labels: string[];
  tags: string[];
  theme: 'light' | 'dark';
  exportedLabel: string;
  lite: boolean;
  /** Set when the inbox comes from an encrypted snapshot that the viewer polls. */
  live: { label: string; refreshing: boolean; stale: boolean } | null;
  /** Drafts left in the encrypted outbox that the bot has not picked up yet. */
  queued?: number;
  /** Names and addresses are masked and blurred (demo mode). */
  privacyOn: boolean;
  onFilters: (filters: ThreadFilters) => void;
  onCompose: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onTogglePrivacy: () => void;
  onShortcuts: () => void;
  onSettings: () => void;
}) {
  const privacyLabel = privacyOn ? 'Show names and emails' : 'Hide names and emails';
  return (
    <aside className="sidebar" aria-label="Folders and labels">
      <div className="sidebar-brand">
        <LogoMark size={26} />
        <span className="brand-name">Grok Bot Inbox</span>
        <button
          type="button"
          className={privacyOn ? 'icon-btn privacy-toggle is-on' : 'icon-btn privacy-toggle'}
          onClick={onTogglePrivacy}
          aria-pressed={privacyOn}
          aria-label={privacyLabel}
          title={`${privacyLabel} (b)`}
        >
          {privacyOn ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      <button type="button" className="btn btn-primary compose-btn" onClick={onCompose} title="New message (c)">
        <PenIcon />
        <span>Compose</span>
      </button>
      <nav className="side-group" aria-label="Folders">
        {FOLDERS.map((folder) => {
          const on = filters.folder === folder.id;
          const count = counts[folder.id];
          return (
            <button
              key={folder.id}
              type="button"
              className={on ? 'side-item is-on' : 'side-item'}
              aria-current={on ? 'page' : undefined}
              onClick={() => onFilters({ ...filters, folder: folder.id })}
            >
              {FOLDER_ICONS[folder.id]}
              <span>{folder.label}</span>
              {count > 0 && <span className={folder.id === 'unread' ? 'side-count is-strong' : 'side-count'}>{count}</span>}
            </button>
          );
        })}
      </nav>
      {labels.length > 0 && (
        <nav className="side-group" aria-label="Labels">
          <p className="side-heading">Labels</p>
          {labels.map((label) => {
            const on = filters.label === label;
            return (
              <button
                key={label}
                type="button"
                className={on ? 'side-item is-on' : 'side-item'}
                aria-pressed={on}
                onClick={() => onFilters({ ...filters, label: on ? null : label })}
              >
                <TagIcon />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      )}
      {tags.length > 0 && (
        <nav className="side-group" aria-label="Plus-tags">
          <p className="side-heading">Addresses</p>
          {tags.map((tag) => {
            const on = filters.tag === tag;
            return (
              <button
                key={tag}
                type="button"
                className={on ? 'side-item is-on' : 'side-item'}
                aria-pressed={on}
                onClick={() => onFilters({ ...filters, tag: on ? null : tag })}
              >
                <HashIcon />
                <span className="mono">+{tag}</span>
              </button>
            );
          })}
        </nav>
      )}
      <div className="side-spacer" />
      <footer className="side-foot">
        <p className="mono side-address" title={privacyOn ? undefined : inboxAddress}>
          <Pii kind="address">{inboxAddress}</Pii>
        </p>
        <p className="side-meta">
          {live ? (
            <span className={live.stale ? 'live-status is-stale' : 'live-status'} title={exportedLabel ? `Exported ${exportedLabel}` : undefined}>
              <span className={live.refreshing ? 'live-dot is-busy' : 'live-dot'} aria-hidden="true" />
              {live.stale ? 'offline · ' : ''}
              {live.label || 'live'}
            </span>
          ) : (
            exportedLabel && <span>Exported {exportedLabel}</span>
          )}
          {lite && <span title="Quoted replies and inline images were left out to keep the link short."> · lite</span>}
          {queued > 0 && (
            <button
              type="button"
              className="queued-pill"
              onClick={onSettings}
              title="Drafts waiting in the encrypted outbox. Your bot picks them up within ~15 min and shows you a draft card."
            >
              {queued} waiting for your bot
            </button>
          )}
        </p>
        <div className="side-tools">
          <button
            type="button"
            className={live?.refreshing ? 'icon-btn is-spinning' : 'icon-btn'}
            onClick={onRefresh}
            aria-label={live ? 'Check for a newer snapshot' : 'Refresh via your bot'}
            title={live ? 'Check for a newer snapshot' : 'Refresh via your bot'}
          >
            <RefreshIcon />
          </button>
          <button type="button" className="icon-btn" onClick={onSettings} aria-label="Settings" title="Settings (sending, this device)">
            <SettingsIcon />
          </button>
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title="Theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="icon-btn" onClick={onShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <KeyboardIcon />
          </button>
        </div>
      </footer>
    </aside>
  );
}
