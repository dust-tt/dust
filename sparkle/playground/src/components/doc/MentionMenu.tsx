import {
  Avatar,
  cn,
  PopoverAnchor,
  PopoverContent,
  PopoverRoot,
} from "@dust-tt/sparkle";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useState,
} from "react";

import type { DocAuthor } from "./docTypes";

// "@" suggestions in comment inputs, like the conversation composer's: a
// list under the field with three sections — who already contributed to this
// file, then people, then agents. Inputs read the candidates from context.

export interface MentionCandidate extends DocAuthor {
  kind: "person" | "agent";
}

export interface MentionCandidates {
  inThisFile: MentionCandidate[];
  people: MentionCandidate[];
  agents: MentionCandidate[];
}

const MentionContext = createContext<MentionCandidates>({
  inThisFile: [],
  people: [],
  agents: [],
});

export function MentionProvider({
  candidates,
  children,
}: {
  candidates: MentionCandidates;
  children: ReactNode;
}) {
  return (
    <MentionContext.Provider value={candidates}>
      {children}
    </MentionContext.Provider>
  );
}

// Per-section caps, so a workspace with hundreds of agents stays scannable.
const LIMITS = { inThisFile: 6, people: 5, agents: 6 };
const LABELS = {
  inThisFile: "In this file",
  people: "People",
  agents: "Agents",
};

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Wires "@" suggestions to a text field. Call `onChange` / `onKeyDown` from
 * the field's handlers (onKeyDown returns true when it handled the key), and
 * render `menu` anywhere next to it.
 */
export function useMentions({
  value,
  setValue,
  inputRef,
}: {
  value: string;
  setValue: (value: string) => void;
  inputRef: RefObject<Field | null>;
}) {
  const candidates = useContext(MentionContext);
  const [active, setActive] = useState<{
    start: number;
    query: string;
    index: number;
  } | null>(null);

  const onChange = (text: string, caret: number | null) => {
    const before = text.slice(0, caret ?? text.length);
    const match = before.match(/(?:^|\s)@([^\s@]*)$/);
    setActive(
      match
        ? {
            start: before.length - match[1].length - 1,
            query: match[1],
            index: 0,
          }
        : null
    );
  };

  const query = active?.query.toLowerCase() ?? "";
  // 0: name starts with the query, 1: a word does, 2: contains it.
  const rank = (c: MentionCandidate) => {
    const name = c.name.toLowerCase();
    if (name.startsWith(query)) return 0;
    if (name.split(/[\s._/-]+/).some((w) => w.startsWith(query))) return 1;
    return name.includes(query) ? 2 : -1;
  };
  const sections = (Object.keys(LABELS) as (keyof MentionCandidates)[])
    .map((key) => {
      const taken = new Set(
        key === "inThisFile" ? [] : candidates.inThisFile.map((c) => c.name)
      );
      return {
        key,
        items: candidates[key]
          .filter((c) => !taken.has(c.name) && rank(c) >= 0)
          .map((c, i) => ({ c, r: rank(c), i }))
          .sort((a, b) => a.r - b.r || a.i - b.i)
          .map(({ c }) => c)
          .slice(0, LIMITS[key]),
      };
    })
    .filter((s) => s.items.length > 0);
  const flat = sections.flatMap((s) => s.items);
  const isOpen = active !== null && flat.length > 0;
  const selectedIndex = Math.min(
    active?.index ?? 0,
    Math.max(flat.length - 1, 0)
  );

  const select = (candidate: MentionCandidate) => {
    if (!active) return;
    const end = active.start + 1 + active.query.length;
    const insert = `@${candidate.name} `;
    const next = value.slice(0, active.start) + insert + value.slice(end);
    setValue(next);
    setActive(null);
    const caret = active.start + insert.length;
    requestAnimationFrame(() => {
      const field = inputRef.current;
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<Field>): boolean => {
    if (!isOpen || !active) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive({
        ...active,
        index: (selectedIndex + step + flat.length) % flat.length,
      });
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      select(flat[selectedIndex]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setActive(null);
      return true;
    }
    return false;
  };

  let i = -1;
  const menu = (
    <PopoverRoot
      open={isOpen}
      onOpenChange={(open) => !open && setActive(null)}
    >
      <PopoverAnchor virtualRef={inputRef as RefObject<Field>} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-72 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex max-h-80 flex-col overflow-y-auto">
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col">
              <div className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {LABELS[section.key]}
              </div>
              {section.items.map((item) => {
                i += 1;
                const index = i;
                return (
                  <button
                    key={`${section.key}-${item.name}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(item);
                    }}
                    onMouseEnter={() =>
                      setActive((s) => (s ? { ...s, index } : s))
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                      index === selectedIndex ? "bg-hover" : "bg-transparent"
                    )}
                  >
                    <Avatar
                      size="xs"
                      name={item.name}
                      visual={item.pictureUrl}
                      isRounded={item.kind === "person"}
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.name}
                    </span>
                    {item.kind === "agent" && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Agent
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );

  return { onChange, onKeyDown, menu };
}
