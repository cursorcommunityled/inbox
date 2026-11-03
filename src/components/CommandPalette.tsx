import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fuzzyFilter } from '../lib/fuzzy';
import { SearchIcon } from './Icons';

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  hint?: ReactNode;
  shortcut?: string;
  keywords?: string;
  icon?: ReactNode;
  run: () => void;
}

export function CommandPalette({
  items,
  placeholder = 'Type a command or search…',
  onClose,
  onSearch,
}: {
  items: PaletteItem[];
  placeholder?: string;
  onClose: () => void;
  /** Called with the raw query when the owner presses Enter on "Search mail for…". */
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const ranked = fuzzyFilter(query, items, (item) => `${item.label} ${item.keywords ?? ''}`, 60);
    const list = ranked.map((r) => r.item);
    if (query.trim()) {
      list.push({
        id: '__search',
        label: `Search mail for "${query.trim()}"`,
        group: 'Search',
        icon: <SearchIcon />,
        run: () => onSearch(query.trim()),
      });
    }
    return list;
  }, [query, items, onSearch]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  function pick(index: number) {
    const item = results[index];
    if (!item) return;
    onClose();
    item.run();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  // Ranked results interleave groups, so headings only make sense for the browse view.
  const showGroups = !query.trim();
  let lastGroup = '';

  return (
    <div className="palette-layer" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={placeholder}
            aria-label="Command palette"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
            aria-controls="palette-list"
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <p className="palette-empty">Nothing matches.</p>}
          {results.map((item, index) => {
            const heading = showGroups && item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {heading && <p className="palette-group">{heading}</p>}
                <button
                  type="button"
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  className={index === active ? 'palette-item is-active' : 'palette-item'}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(index)}
                >
                  <span className="palette-icon">{item.icon}</span>
                  <span className="palette-label">
                    {item.label}
                    {item.hint && <span className="palette-hint">{item.hint}</span>}
                  </span>
                  {!showGroups && <span className="palette-group-tag">{item.group}</span>}
                  {item.shortcut && <kbd className="palette-kbd">{item.shortcut}</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <footer className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
        </footer>
      </div>
    </div>
  );
}
