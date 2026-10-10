import {
  Avatar,
  cn,
  Dialog,
  DialogContent,
  FilterChips,
  Icon,
  KeyboardShortcut,
  SearchInput,
} from "@dust-tt/sparkle";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DataSourceAvatar } from "../data/types";

/** Enough of a group to be worth scanning, short enough to leave room for the next. */
const MAX_PER_GROUP = 5;

/** A single character already narrows thousands of files to a readable list. */
const MIN_QUERY_LENGTH = 1;

const ALL_FILTER = "All";

export interface CommandPaletteItem {
  id: string;
  /** The heading it is listed under, and the chip that narrows to it. */
  group: string;
  label: string;
  /** Second line, e.g. where a file sits or who an agent belongs to. */
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  avatar?: DataSourceAvatar;
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
  /** Offered before anything is typed, the way "New conversation" is. */
  actions?: CommandPaletteItem[];
}

interface ItemRowProps {
  rowRef: (el: HTMLDivElement | null) => void;
  isSelected: boolean;
  onClick: () => void;
  onMouseMove: () => void;
  children: ReactNode;
}

/**
 * Takes `rowRef` rather than `ref`: on React 18 a function component only
 * receives a ref through `forwardRef`, and a plain `ref` prop is dropped.
 */
function ItemRow({
  rowRef,
  isSelected,
  onClick,
  onMouseMove,
  children,
}: ItemRowProps) {
  return (
    <div
      ref={rowRef}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm",
        "text-foreground transition-colors duration-150",
        // Selection only — a stationary pointer and the keyboard must not
        // light up two rows at once.
        isSelected && "bg-hover"
      )}
      onClick={onClick}
      onMouseMove={onMouseMove}
    >
      {children}
    </div>
  );
}

function ItemVisual({ item }: { item: CommandPaletteItem }) {
  if (item.avatar?.emoji) {
    return (
      <Avatar
        size="xs"
        emoji={item.avatar.emoji}
        backgroundColor={item.avatar.backgroundColor}
      />
    );
  }
  const visual = item.avatar?.icon ?? item.icon;
  return visual ? <Icon visual={visual} size="xs" /> : null;
}

/**
 * The workspace behind one field: everything addressable is listed here, and
 * typing narrows it. Opens on ⌘K, and answers to the arrow keys throughout so
 * a result can be reached without going back to the pointer.
 */
export function CommandPalette({
  isOpen,
  onClose,
  items,
  actions = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState(ALL_FILTER);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Opening is what resets the palette, not closing: clearing on close would
  // wipe the list while the dialog is still animating out.
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedFilter(ALL_FILTER);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= MIN_QUERY_LENGTH;

  const filters = useMemo(() => {
    const groups: string[] = [];
    for (const item of items) {
      if (!groups.includes(item.group)) {
        groups.push(item.group);
      }
    }
    return [ALL_FILTER, ...groups];
  }, [items]);

  const matches = useMemo(() => {
    if (!isSearching) {
      return [];
    }
    const needle = trimmedQuery.toLowerCase();
    return items.filter((item) => {
      if (selectedFilter !== ALL_FILTER && item.group !== selectedFilter) {
        return false;
      }
      return (
        item.label.toLowerCase().includes(needle) ||
        item.description?.toLowerCase().includes(needle)
      );
    });
  }, [items, isSearching, trimmedQuery, selectedFilter]);

  /** Groups in the order they first appear, each capped so no one group fills the list. */
  const groupedMatches = useMemo(() => {
    const groups = new Map<string, CommandPaletteItem[]>();
    for (const item of matches) {
      const group = groups.get(item.group);
      if (group) {
        if (group.length < MAX_PER_GROUP) {
          group.push(item);
        }
      } else {
        groups.set(item.group, [item]);
      }
    }
    return [...groups.entries()];
  }, [matches]);

  /** What the arrow keys walk: the rows actually on screen, in screen order. */
  const visibleItems = useMemo(
    () =>
      isSearching ? groupedMatches.flatMap(([, group]) => group) : actions,
    [isSearching, groupedMatches, actions]
  );

  useEffect(() => {
    rowRefs.current.length = visibleItems.length;
    setSelectedIndex(0);
  }, [visibleItems.length]);

  useEffect(() => {
    rowRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Deferred a frame: Radix traps focus on mount, so focusing any earlier is
  // undone before the field is usable.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  function selectItem(item: CommandPaletteItem) {
    onClose();
    item.onSelect();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const total = visibleItems.length;
    if (total === 0) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % total);
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((index) => (index - 1 + total) % total);
        break;
      case "Enter": {
        event.preventDefault();
        const item = visibleItems[selectedIndex];
        if (item) {
          selectItem(item);
        }
        break;
      }
    }
  }

  let rowIndex = 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg" variant="command" trapFocusScope>
        <div className="flex flex-col">
          <div className="border-b border-separator p-3">
            <SearchInput
              ref={inputRef}
              name="command-palette-search"
              placeholder="Search…"
              value={query}
              onChange={setQuery}
              onKeyDown={handleKeyDown}
            />
            {filters.length > 1 && (
              <div className="pt-2">
                <FilterChips
                  filters={filters}
                  selectedFilter={selectedFilter}
                  variant="secondary"
                  onFilterClick={(filter) => {
                    setSelectedFilter(filter);
                    setSelectedIndex(0);
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex max-h-125 flex-col gap-2 overflow-y-auto p-1.5">
            {!isSearching &&
              actions.map((item, index) => (
                <ItemRow
                  key={item.id}
                  rowRef={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  isSelected={selectedIndex === index}
                  onClick={() => selectItem(item)}
                  onMouseMove={() => setSelectedIndex(index)}
                >
                  <ItemVisual item={item} />
                  <span className="font-medium">{item.label}</span>
                </ItemRow>
              ))}

            {isSearching && groupedMatches.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            )}

            {isSearching &&
              groupedMatches.map(([group, groupItems]) => (
                <div key={group}>
                  <div className="px-3 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground">
                    {group}
                  </div>
                  {groupItems.map((item) => {
                    const index = rowIndex++;
                    return (
                      <ItemRow
                        key={item.id}
                        rowRef={(el) => {
                          rowRefs.current[index] = el;
                        }}
                        isSelected={selectedIndex === index}
                        onClick={() => selectItem(item)}
                        onMouseMove={() => setSelectedIndex(index)}
                      >
                        <ItemVisual item={item} />
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 font-medium">
                            {item.label}
                          </span>
                          {item.description && (
                            <>
                              <span className="shrink-0 text-muted-foreground">
                                -
                              </span>
                              <span className="min-w-0 truncate text-muted-foreground">
                                {item.description}
                              </span>
                            </>
                          )}
                        </div>
                      </ItemRow>
                    );
                  })}
                </div>
              ))}
          </div>

          <div
            className={cn(
              "flex items-center justify-end gap-4 border-t px-4 py-2",
              "border-separator text-xs text-muted-foreground"
            )}
          >
            {[
              { keys: ["↑", "↓"], label: "Navigate" },
              { keys: ["↵"], label: "Select" },
              { keys: ["Esc"], label: "Close" },
            ].map((hint) => (
              <div key={hint.label} className="flex items-center gap-1.5">
                {hint.keys.map((key) => (
                  <KeyboardShortcut
                    key={key}
                    shortcut={key}
                    className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded border px-1",
                      "border-separator text-xs shadow-xs"
                    )}
                  />
                ))}
                <span>{hint.label}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
