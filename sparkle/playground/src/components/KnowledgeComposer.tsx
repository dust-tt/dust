import {
  AnchoredPopover,
  Attachment01,
  Button,
  cn,
  File01,
  PuzzlePiece01,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { KnowledgeItem, KnowledgeTreeNode } from "../data/knowledgeItems";
import {
  findNodePath,
  getBrowseChildren,
  getFilteredTreeGroups,
  mockKnowledgeTree,
} from "../data/knowledgeItems";
import { mockSkills } from "../data/skills";
import { useCaretCoordinates } from "../hooks/useCaretCoordinates";
import { useSlashTrigger } from "../hooks/useSlashTrigger";
import { AttachedKnowledgeRow } from "./AttachedKnowledgeRow";
import {
  KNOWLEDGE_LISTBOX_ID,
  KnowledgeSuggestionPanel,
} from "./KnowledgeSuggestionPanel";
import type { SlashMenuEntry } from "./SlashMenuPanel";
import {
  SLASH_COMMANDS,
  SlashCommandMenu,
  buildSlashMenuEntries,
} from "./SlashMenuPanel";

const LOADING_SIMULATION_MS = 220;
const REMOVE_ANIMATION_MS = 100;

const attachedItemsById = new Map(
  mockKnowledgeTree.map((node) => [node.id, node])
);

// The "/" trigger's first step is always the command menu (commands and
// skills together, flat); picking "Attach knowledge" is the only one that
// hands off to a further step.
type SlashStep = "menu" | "knowledge";

export function KnowledgeComposer() {
  const [value, setValue] = useState("");
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  const [attachedItems, setAttachedItems] = useState<KnowledgeItem[]>([]);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const [dismissedTriggerIndex, setDismissedTriggerIndex] = useState<
    number | null
  >(null);

  const [slashStep, setSlashStep] = useState<SlashStep>("menu");

  // The browse path: each entry is the space/folder whose children are
  // currently listed. Empty = the space list (the root).
  const [browseStack, setBrowseStack] = useState<KnowledgeTreeNode[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const popoverContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretAnchorRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const slashTrigger = useSlashTrigger(value, selectionStart);
  const isPickerOpen =
    isTextareaFocused &&
    slashTrigger.isActive &&
    dismissedTriggerIndex !== slashTrigger.triggerIndex;

  const activeQuery = slashTrigger.query;
  const isFiltering = activeQuery.trim().length > 0;

  // Reset to the command menu every time a *new* "/" session starts — either
  // the trigger just went from inactive to active (typed a fresh "/", even
  // at a position used before) or it moved to a different position while
  // staying active. Tracked as state (not a plain mutated ref) so this
  // stays correct under Strict Mode's double-render.
  const [prevSlash, setPrevSlash] = useState({
    isActive: slashTrigger.isActive,
    triggerIndex: slashTrigger.triggerIndex,
  });
  const isNewSlashSession =
    slashTrigger.isActive &&
    (!prevSlash.isActive ||
      slashTrigger.triggerIndex !== prevSlash.triggerIndex);
  if (isNewSlashSession && slashStep !== "menu") {
    setSlashStep("menu");
  }
  if (
    prevSlash.isActive !== slashTrigger.isActive ||
    prevSlash.triggerIndex !== slashTrigger.triggerIndex
  ) {
    setPrevSlash({
      isActive: slashTrigger.isActive,
      triggerIndex: slashTrigger.triggerIndex,
    });
  }

  const caretCoords = useCaretCoordinates(
    textareaRef,
    value,
    selectionStart ?? 0,
    isPickerOpen
  );

  const attachedIds = useMemo(
    () => new Set(attachedItems.map((item) => item.id)),
    [attachedItems]
  );

  const filteredGroups = useMemo(
    () =>
      getFilteredTreeGroups({
        query: activeQuery,
        excludeIds: attachedIds,
      }),
    [activeQuery, attachedIds]
  );

  const currentBrowseNode = browseStack[browseStack.length - 1] ?? null;
  const browseChildren = useMemo(
    () =>
      getBrowseChildren({
        node: currentBrowseNode,
        excludeIds: attachedIds,
      }),
    [currentBrowseNode, attachedIds]
  );

  const menuEntries = useMemo(
    () => buildSlashMenuEntries(SLASH_COMMANDS, mockSkills),
    []
  );

  const filteredMenuEntries = useMemo(() => {
    const trimmed = activeQuery.trim().toLowerCase();
    if (!trimmed) {
      return menuEntries;
    }
    return menuEntries.filter((entry) => {
      const haystack =
        entry.kind === "command"
          ? entry.command.label
          : `${entry.skill.name} ${entry.skill.description}`;
      return haystack.toLowerCase().includes(trimmed);
    });
  }, [menuEntries, activeQuery]);

  const knowledgeFlatItems = isFiltering
    ? filteredGroups.groups.flatMap((group) => group.files)
    : browseChildren;

  const flatItems: Array<{ id: string }> =
    slashStep === "menu" ? filteredMenuEntries : knowledgeFlatItems;

  const activeItemId = flatItems[activeIndex]?.id ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [activeQuery, isPickerOpen, browseStack, slashStep]);

  useEffect(() => {
    if (!isPickerOpen || hasLoadedOnce) {
      return;
    }
    setIsLoading(true);
    const timeout = setTimeout(() => {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }, LOADING_SIMULATION_MS);
    return () => clearTimeout(timeout);
  }, [isPickerOpen, hasLoadedOnce]);

  // Escape / click-outside with nothing picked: just dismiss, leaving
  // whatever was typed in place.
  const closeInlinePicker = () => {
    setDismissedTriggerIndex(slashTrigger.triggerIndex);
    setBrowseStack([]);
    setSlashStep("menu");
  };

  const focusCaret = (caret: number) => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  // "Attach knowledge" is just a second way to type "/": it inserts the
  // trigger at the caret and lets the inline flow take over, so the button
  // and the keystroke open the very same dropdown in the very same place.
  const insertSlashTrigger = () => {
    const caret = selectionStart ?? value.length;
    const charBefore = caret === 0 ? "" : value[caret - 1];
    // useSlashTrigger only recognises a "/" that starts a word, so a space
    // goes in first when the caret sits right after other text.
    const inserted = charBefore === "" || /\s/.test(charBefore) ? "/" : " /";
    const nextCaret = caret + inserted.length;

    setValue(value.slice(0, caret) + inserted + value.slice(caret));
    setSelectionStart(nextCaret);
    setDismissedTriggerIndex(null);
    setBrowseStack([]);
    setSlashStep("menu");
    focusCaret(nextCaret);
  };

  // Shared by every attach path (knowledge, skills, upload) — adds the chip
  // and closes the picker, same as picking a single result anywhere else.
  const attachItem = (item: KnowledgeItem) => {
    setAttachedItems((prev) => [...prev, item]);
    // Removes the "/" trigger itself (not just the typed query), which is
    // what actually closes the picker — there's no active trigger left
    // for useSlashTrigger to find.
    if (selectionStart !== null) {
      const start = slashTrigger.triggerIndex;
      const end = selectionStart;
      setValue(value.slice(0, start) + value.slice(end));
      setSelectionStart(start);
      focusCaret(start);
    }
    setBrowseStack([]);
    setSlashStep("menu");
  };

  const handleSelectItemById = (id: string) => {
    const node = attachedItemsById.get(id);
    if (!node) {
      return;
    }
    attachItem({
      id: node.id,
      name: node.fileName,
      spaceName: node.spaceName,
      icon: node.icon,
      lastUsedAt: node.updatedAt,
      usageCount: 0,
      source: node.source,
    });
  };

  // Strips whatever was typed to filter (keeping the "/" itself) so the
  // query starts empty again at the same trigger position — used both when
  // a command is picked and when a search hit is opened.
  const clearQuery = () => {
    if (selectionStart === null) {
      return;
    }
    const start = slashTrigger.triggerIndex + 1;
    const end = selectionStart;
    setValue(value.slice(0, start) + value.slice(end));
    setSelectionStart(start);
    focusCaret(start);
  };

  const handleSelectMenuEntry = (entry: SlashMenuEntry) => {
    if (entry.kind === "skill") {
      attachItem({
        id: entry.skill.id,
        name: entry.skill.name,
        spaceName: "Skill",
        icon: PuzzlePiece01,
        lastUsedAt: new Date(),
        usageCount: 0,
        source: "company",
      });
      return;
    }
    if (entry.command.id === "upload") {
      uploadInputRef.current?.click();
      return;
    }
    clearQuery();
    setSlashStep("knowledge");
  };

  const handleFileChosen = (file: File) => {
    attachItem({
      id: `upload-${file.name}-${file.size}`,
      name: file.name,
      spaceName: "Uploaded",
      icon: File01,
      lastUsedAt: new Date(),
      usageCount: 0,
      source: "company",
    });
  };

  const handleOpenNode = (node: KnowledgeTreeNode) => {
    if (node.kind === "file") {
      return;
    }
    // The full ancestor chain, not just an append onto the current stack —
    // this is what lets opening a folder found via search (with no browse
    // stack built up yet) land on a correct breadcrumb in one step.
    setBrowseStack(findNodePath(node.id) ?? []);
    if (isFiltering) {
      clearQuery();
    }
  };

  // Back out of the knowledge step, dropping the browse position and the
  // filter text it accumulated so the menu reopens exactly as first shown.
  const handleBackToMenu = () => {
    clearQuery();
    setBrowseStack([]);
    setSlashStep("menu");
  };

  const handleBreadcrumbNavigate = (depth: number) => {
    setBrowseStack((prev) => prev.slice(0, depth));
  };

  const handleRemoveItem = (item: KnowledgeItem) => {
    setRemovingIds((prev) => new Set(prev).add(item.id));
    setTimeout(() => {
      setAttachedItems((prev) => prev.filter((entry) => entry.id !== item.id));
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, REMOVE_ANIMATION_MS);
  };

  const handleListNavigationKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        const item = flatItems[activeIndex];
        if (!item) {
          break;
        }
        e.preventDefault();
        if (slashStep === "menu") {
          handleSelectMenuEntry(item as SlashMenuEntry);
          break;
        }
        // Knowledge, in browse or search results alike: a file attaches
        // either way, a folder browses into it on plain Enter but attaches
        // it whole on Shift+Enter, and a space only ever browses (there's
        // no "attach a whole space" concept here).
        const node = item as KnowledgeTreeNode;
        if (node.kind === "file") {
          handleSelectItemById(node.id);
        } else if (e.shiftKey && node.kind !== "space") {
          handleSelectItemById(node.id);
        } else {
          handleOpenNode(node);
        }
        break;
      }
      case "Backspace":
        // Shift+Backspace goes up one breadcrumb level — plain Backspace is
        // already spoken for (deleting a character from the search query),
        // so this needs its own combo rather than only firing when the
        // query happens to be empty.
        if (
          e.shiftKey &&
          slashStep === "knowledge" &&
          !isFiltering &&
          browseStack.length > 0
        ) {
          e.preventDefault();
          setBrowseStack((prev) => prev.slice(0, -1));
        }
        break;
      case "Escape":
        e.preventDefault();
        closeInlinePicker();
        break;
      default:
        break;
    }
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (!isPickerOpen) {
      return;
    }
    handleListNavigationKeyDown(e);
  };

  const syncSelection = (target: HTMLTextAreaElement) => {
    setSelectionStart(target.selectionStart);
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-1.5">
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            handleFileChosen(file);
          }
        }}
      />

      {/* Outside the input box entirely — its own row above it, not
          sharing the input's border/background. */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          label="Attach knowledge"
          icon={Attachment01}
          isCounter={attachedItems.length > 0}
          counterValue={String(attachedItems.length)}
          // Keeps focus in the textarea: without this the mousedown blurs
          // it, which closes the picker the click is meant to open (and
          // loses the caret position the "/" has to land on).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (isPickerOpen) {
              closeInlinePicker();
              return;
            }
            insertSlashTrigger();
          }}
        />
      </div>

      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-2xl border bg-background p-1 transition-colors duration-150",
          isTextareaFocused
            ? "border-border-focus ring-2 ring-highlight/20"
            : "border-border"
        )}
      >
        <AttachedKnowledgeRow
          items={attachedItems}
          removingIds={removingIds}
          onRemove={handleRemoveItem}
        />

        <div className="relative">
          <TextArea
            ref={textareaRef}
            value={value}
            minRows={6}
            resize="vertical"
            placeholder="Describe what this skill should do…"
            className="border-none bg-transparent shadow-none focus-visible:ring-0"
            role={isPickerOpen ? "combobox" : undefined}
            aria-expanded={isPickerOpen || undefined}
            aria-controls={isPickerOpen ? KNOWLEDGE_LISTBOX_ID : undefined}
            aria-autocomplete={isPickerOpen ? "list" : undefined}
            aria-activedescendant={
              isPickerOpen ? (activeItemId ?? undefined) : undefined
            }
            onFocus={() => setIsTextareaFocused(true)}
            onBlur={(e) => {
              // Clicking a control inside the popover (a breadcrumb, a row)
              // moves focus there natively before our click handler runs.
              // That's still part of this same picker session, not a
              // real dismissal — only close it when focus lands truly
              // outside the popover.
              if (
                popoverContainerRef.current?.contains(
                  e.relatedTarget as Node | null
                )
              ) {
                return;
              }
              setIsTextareaFocused(false);
            }}
            onChange={(e) => {
              setValue(e.target.value);
              syncSelection(e.target);
            }}
            onClick={(e) => syncSelection(e.currentTarget)}
            onKeyUp={(e) => syncSelection(e.currentTarget)}
            onKeyDown={handleTextareaKeyDown}
          />
          {isPickerOpen && (
            <div
              ref={caretAnchorRef}
              className="pointer-events-none absolute h-4 w-px"
              style={{ top: caretCoords.top, left: caretCoords.left }}
            />
          )}
          {value.length === 0 && (
            <span className="pointer-events-none absolute bottom-3 right-3 text-xs text-muted-foreground">
              Type <span className="font-medium">/</span> for knowledge
            </span>
          )}
        </div>
      </div>

      <div ref={popoverContainerRef}>
        <AnchoredPopover
          open={isPickerOpen}
          anchorRef={caretAnchorRef}
          align="start"
          side="bottom"
          sideOffset={8}
          className="w-auto p-0"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            closeInlinePicker();
          }}
          onPointerDownOutside={closeInlinePicker}
        >
          {slashStep === "menu" ? (
            <SlashCommandMenu
              entries={filteredMenuEntries}
              activeId={activeItemId}
              onHover={(id) => {
                const index = filteredMenuEntries.findIndex((e) => e.id === id);
                if (index !== -1) {
                  setActiveIndex(index);
                }
              }}
              onSelect={handleSelectMenuEntry}
            />
          ) : (
            <KnowledgeSuggestionPanel
              query={activeQuery}
              onBack={handleBackToMenu}
              isLoading={isLoading}
              activeItemId={activeItemId}
              onHoverItem={(id) => {
                const index = knowledgeFlatItems.findIndex(
                  (item) => item.id === id
                );
                if (index !== -1) {
                  setActiveIndex(index);
                }
              }}
              onSelectItem={(node) => handleSelectItemById(node.id)}
              isFiltering={isFiltering}
              groups={filteredGroups.groups}
              matchCount={filteredGroups.matchCount}
              browseStack={browseStack}
              browseChildren={browseChildren}
              onOpenNode={handleOpenNode}
              onBreadcrumbNavigate={handleBreadcrumbNavigate}
            />
          )}
        </AnchoredPopover>
      </div>
    </div>
  );
}
