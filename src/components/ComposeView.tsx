import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { canShare, copyText, shareText } from '../lib/clipboard';
import { CommandError, formatSendCommand, parseRecipients, type SendCommand } from '../lib/command';
import { draftBody, type Draft } from '../lib/compose';
import { OUTBOX_PICKUP_HINT, type DeliveryOutcome, type DeliveryTarget } from '../lib/outbox';
import { maskText, maskTextToHtml } from '../lib/privacy';
import { CloseIcon, CopyIcon, MaximizeIcon, MinimizeIcon, SendIcon, ShareIcon, TrashIcon } from './Icons';
import { Pii, usePrivacy } from './Privacy';

const TITLES: Record<Draft['kind'], string> = {
  new: 'New message',
  reply: 'Reply',
  'reply-all': 'Reply all',
  forward: 'Forward',
};

export function ComposeView({
  draft,
  inboxAddress,
  onChange,
  onHanded,
  onDiscard,
  onClose,
  onToast,
  delivery = 'copy',
  onDeliver,
  onOpenSettings,
}: {
  draft: Draft;
  inboxAddress: string;
  onChange: (draft: Draft) => void;
  onHanded: (draft: Draft) => void;
  onDiscard: () => void;
  onClose: () => void;
  onToast: (message: string, tone?: 'info' | 'error') => void;
  /** How "Send with my bot" reaches the bot from this device: webhook (instant), outbox (encrypted, picked up on a schedule), or copy. */
  delivery?: DeliveryTarget;
  /** Hands the payload to the bot: webhook first when configured, then the encrypted outbox. */
  onDeliver?: (command: Omit<SendCommand, 'version'>, commandText: string) => Promise<DeliveryOutcome>;
  onOpenSettings?: () => void;
}) {
  const botReady = delivery !== 'copy' && Boolean(onDeliver);
  const privacy = usePrivacy();
  const toRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [showCommand, setShowCommand] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTo = draft.kind === 'forward' || draft.kind === 'new';

  useEffect(() => {
    (needsTo ? toRef.current : bodyRef.current)?.focus();
  }, [draft.id, needsTo]);

  const command = useMemo(() => {
    try {
      return {
        text: formatSendCommand({
          from: inboxAddress,
          kind: draft.kind,
          thread: draft.threadId,
          inReplyTo: draft.inReplyTo,
          to: parseRecipients(draft.to),
          cc: parseRecipients(draft.cc),
          subject: draft.subject,
          body: draftBody(draft),
        }),
        problem: null,
      };
    } catch (err) {
      return { text: null, problem: err instanceof CommandError ? err.message : 'This draft cannot be formatted yet.' };
    }
  }, [draft, inboxAddress]);

  function update(patch: Partial<Draft>) {
    setError(null);
    onChange({ ...draft, ...patch, updatedAt: new Date().toISOString() });
  }

  async function handToBot(mode: 'copy' | 'share', event?: FormEvent) {
    event?.preventDefault();
    if (!command.text) {
      setError(command.problem);
      return;
    }
    const ok =
      mode === 'share' ? await shareText(`Send with my bot: ${draft.subject}`, command.text) : await copyText(command.text);
    if (!ok) {
      setShowCommand(true);
      onToast(
        mode === 'share' ? 'Sharing was cancelled. Copy the block instead.' : 'Could not copy. Select the block below and copy it.',
        'error',
      );
      return;
    }
    onHanded({ ...draft, handedToBotAt: new Date().toISOString() });
    onToast(mode === 'share' ? 'Shared. Paste it in your bot chat.' : 'Copied, paste it in your bot chat');
  }

  async function sendViaBot(event?: FormEvent) {
    event?.preventDefault();
    if (!command.text || !onDeliver) {
      setError(command.problem);
      return;
    }
    setSending(true);
    try {
      const outcome = await onDeliver(
        {
          from: inboxAddress,
          kind: draft.kind,
          thread: draft.threadId,
          inReplyTo: draft.inReplyTo,
          to: parseRecipients(draft.to),
          cc: parseRecipients(draft.cc),
          subject: draft.subject,
          body: draftBody(draft),
        },
        command.text,
      );
      if (outcome.ok) {
        onHanded({ ...draft, handedToBotAt: new Date().toISOString() });
        if (outcome.via === 'outbox') {
          onToast(
            outcome.webhookError
              ? `Webhook unreachable, so the draft was queued for your bot instead. It will show you the draft ${OUTBOX_PICKUP_HINT}.`
              : `Queued for your bot — it will show you the draft ${OUTBOX_PICKUP_HINT}.`,
          );
        } else {
          onToast('Sent to your bot — confirm the draft in your Grok Bot chat.');
        }
        return;
      }
      setShowCommand(true);
      onToast(`${outcome.error ?? 'The bot could not be reached.'} Copy the command instead.`, 'error');
    } finally {
      setSending(false);
    }
  }

  const problem = error ?? (!command.text && (draft.body || draft.to) ? command.problem : null);
  const primary = botReady ? sendViaBot : (event?: FormEvent) => handToBot('copy', event);

  return (
    <section className={expanded ? 'compose is-expanded' : 'compose'} aria-label={TITLES[draft.kind]}>
      <form className="compose-card" onSubmit={(event) => void primary(event)}>
        <header className="compose-head">
          <div className="compose-title">
            <h2>{TITLES[draft.kind]}</h2>
            {draft.handedToBotAt && <span className="handed-pill">Handed to bot</span>}
          </div>
          <div className="compose-head-tools">
            <button
              type="button"
              className="icon-btn is-small"
              onClick={() => setExpanded((v) => !v)}
              aria-pressed={expanded}
              aria-label={expanded ? 'Shrink compose' : 'Expand compose'}
              title={expanded ? 'Shrink' : 'Expand'}
            >
              {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
            <button type="button" className="icon-btn is-small" onClick={onClose} aria-label="Close compose (draft is kept)" title="Close (Esc)">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="compose-fields">
          <div className="field is-static">
            <span>From</span>
            <span className="mono field-static">
              <Pii kind="address">{inboxAddress}</Pii>
            </span>
          </div>
          <label className="field">
            <span>To</span>
            <input
              ref={toRef}
              className="pii-field"
              type="text"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="name@example.com, Another <other@example.com>"
              value={draft.to}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Cc</span>
            <input
              className="pii-field"
              type="text"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              value={draft.cc}
              onChange={(event) => update({ cc: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Subject</span>
            <input type="text" value={draft.subject} onChange={(event) => update({ subject: event.target.value })} />
          </label>
          <textarea
            ref={bodyRef}
            className="compose-body"
            placeholder="Write your message"
            value={draft.body}
            rows={expanded ? 16 : 8}
            onChange={(event) => update({ body: event.target.value })}
          />
          {draft.quoted && (
            <details className="quoted-draft">
              <summary>
                <label onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={draft.includeQuote} onChange={(event) => update({ includeQuote: event.target.checked })} />{' '}
                  Include the {draft.kind === 'forward' ? 'forwarded message' : 'quoted original'}
                </label>
              </summary>
              {privacy.on ? (
                // A textarea cannot blur part of its text, so the quoted original is shown masked and read-only; the draft keeps the real text.
                <textarea className="compose-quote" aria-label="Quoted original (names and emails hidden)" value={maskText(draft.quoted, privacy.names)} rows={6} readOnly />
              ) : (
                <textarea className="compose-quote" aria-label="Quoted original" value={draft.quoted} rows={6} onChange={(event) => update({ quoted: event.target.value })} />
              )}
            </details>
          )}
        </div>

        {problem && (
          <p className="compose-problem" role="status">
            {problem}
          </p>
        )}

        {showCommand &&
          (privacy.on && command.text ? (
            <pre className="command-preview mono" tabIndex={0} aria-label="Command block (names and emails hidden)" dangerouslySetInnerHTML={{ __html: maskTextToHtml(command.text, privacy.names) }} />
          ) : (
            <pre className="command-preview mono" tabIndex={0} aria-label="Command block">
              {command.text ?? `Fix the draft first: ${command.problem}`}
            </pre>
          ))}

        <footer className="compose-foot">
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {botReady ? <SendIcon /> : <CopyIcon />}
            {sending ? (delivery === 'outbox' ? 'Queuing…' : 'Sending…') : 'Send with my bot'}
          </button>
          {botReady && (
            <button type="button" className="btn" onClick={() => void handToBot('copy')} title="Copy the command block instead of posting it">
              <CopyIcon />
              Copy
            </button>
          )}
          {canShare() && (
            <button type="button" className="btn" onClick={() => void handToBot('share')}>
              <ShareIcon />
              Share
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => setShowCommand((v) => !v)} aria-pressed={showCommand}>
            {showCommand ? 'Hide command' : 'Show command'}
          </button>
          <span className="compose-spacer" />
          <button type="button" className="icon-btn is-small" onClick={onDiscard} aria-label="Discard draft" title="Discard draft">
            <TrashIcon />
          </button>
        </footer>
        <p className="compose-note">
          {delivery === 'webhook' && botReady ? (
            <>The viewer never sends mail. This posts the draft to your bot, which shows a draft card you confirm.</>
          ) : delivery === 'outbox' && botReady ? (
            <>
              The viewer never sends mail. This leaves an encrypted draft for your bot, which picks it up {OUTBOX_PICKUP_HINT} and shows you a draft
              card to confirm.
              {onOpenSettings && (
                <>
                  {' '}
                  <button type="button" className="link-btn" onClick={onOpenSettings}>
                    Add a webhook
                  </button>{' '}
                  for instant delivery.
                </>
              )}
            </>
          ) : (
            <>
              The viewer never sends mail. Paste the block in your Grok Bot chat; the bot shows a draft card you confirm.
              {onOpenSettings && (
                <>
                  {' '}
                  <button type="button" className="link-btn" onClick={onOpenSettings}>
                    Connect a webhook
                  </button>{' '}
                  to skip the paste.
                </>
              )}
            </>
          )}
        </p>
      </form>
    </section>
  );
}
