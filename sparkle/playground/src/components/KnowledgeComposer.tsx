import {
  AnchoredPopover,
  Button,
  cn,
  File01,
  Folder,
  Plus,
  PuzzlePiece01,
  TextArea,
} from "@dust-tt/sparkle";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { KnowledgeTreeNode } from "../data/knowledgeItems";
import {
  findNodePath,
  getBrowseChildren,
  getFilteredTreeGroups,
  mockKnowledgeTree,
} from "../data/knowledgeItems";
import { getDataSourceIcon } from "../data/dataSources";
import { mockSkills } from "../data/skills";
import { useCaretCoordinates } from "../hooks/useCaretCoordinates";
import { useSlashTrigger } from "../hooks/useSlashTrigger";
import type { AttachedItem } from "./AttachedKnowledgeGroups";
import { AttachedKnowledgeGroups } from "./AttachedKnowledgeGroups";
import {
  KNOWLEDGE_LISTBOX_ID,
  KnowledgeSuggestionPanel,
} from "./KnowledgeSuggestionPanel";
import type {
  SlashCommand,
  SlashMenuEntry,
  SlashSuggestion,
} from "./SlashMenuPanel";
import {
  SLASH_COMMANDS,
  SlashCommandMenu,
  buildSlashMenuEntries,
} from "./SlashMenuPanel";

const LOADING_SIMULATION_MS = 220;

// Attachments live in the text as "@Name" tokens. Highlighting them needs no
// horizontal displacement, so the negative margin exactly cancels the padding
// — otherwise every token after the first would drift off the real text.
const TOKEN_CLASSES = "-mx-0.5 rounded-sm bg-muted-background px-0.5";

function buildToken(name: string) {
  return `@${name}`;
}

// Splits text on the attached tokens so the mirror can highlight them.
function renderWithTokens(text: string, tokens: string[]) {
  if (tokens.length === 0 || text.length === 0) {
    return text;
  }
  // Longest first, so a token that contains a shorter one still wins.
  const sorted = [...tokens].sort((a, b) => b.length - a.length);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let plainStart = 0;
  while (cursor < text.length) {
    const hit = sorted.find((token) => text.startsWith(token, cursor));
    if (!hit) {
      cursor += 1;
      continue;
    }
    if (plainStart < cursor) {
      parts.push(text.slice(plainStart, cursor));
    }
    parts.push(
      <span key={cursor} className={TOKEN_CLASSES}>
        {hit}
      </span>
    );
    cursor += hit.length;
    plainStart = cursor;
  }
  if (plainStart < text.length) {
    parts.push(text.slice(plainStart));
  }
  return parts;
}

const attachedItemsById = new Map(
  mockKnowledgeTree.map((node) => [node.id, node])
);

// The "/" trigger's first step is always the command menu (commands and
// skills together, flat); picking "Browse Knowledge" is the only one that
// hands off to a further step.
type SlashStep = "menu" | "knowledge";

export function KnowledgeComposer({
  className,
  minRows = 6,
  placeholder = "Describe what this skill should do…",
  onAddKnowledge,
  commands = SLASH_COMMANDS,
}: {
  className?: string;
  // The homepage input bar is compact; the skill builder's instructions
  // field is not.
  minRows?: number;
  placeholder?: string;
  // Hands the "Insert" action to the host, which then owns the button —
  // the skill builder puts it on the section-title line. Mirrors
  // SkillBuilderInstructionsSection's own onAddKnowledge wiring. When set,
  // the composer stops rendering its own button.
  onAddKnowledge?: (insert: () => void) => void;
  // Which commands the menu offers — hosts differ (see
  // SKILL_BUILDER_SLASH_COMMANDS).
  commands?: SlashCommand[];
}) {
  const [value, setValue] = useState("");
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  const [attachedItems, setAttachedItems] = useState<AttachedItem[]>([]);

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

  // A bare "/" reads as a typo; the hint says what the menu expects. It goes
  // away the moment there's a query, since the real text takes its place.
  const showInlineHint = isPickerOpen && slashTrigger.query.length === 0;

  const attachedIds = useMemo(
    () => new Set(attachedItems.map((item) => item.id)),
    [attachedItems]
  );

  const tokens = useMemo(
    () => attachedItems.map((item) => item.token),
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

  // A short "start here" list above the commands. Resolved from the mock data
  // by name rather than hardcoded ids, since both are generated.
  const suggestions = useMemo<SlashSuggestion[]>(() => {
    const result: SlashSuggestion[] = [];

    const pushSkill = (skillId: string, tag?: string) => {
      const skill = mockSkills.find((candidate) => candidate.id === skillId);
      if (!skill) {
        return;
      }
      result.push({
        id: `suggested-${skill.id}`,
        label: skill.name,
        description: skill.description,
        icon: PuzzlePiece01,
        tone: "skill",
        target: { kind: "skill", skillId: skill.id },
        tag,
      });
    };

    pushSkill("skill-branded-frame", "New");

    const designFolder = mockKnowledgeTree.find(
      (node) => node.kind === "folder" && node.fileName === "Design"
    );
    if (designFolder) {
      result.push({
        id: `suggested-${designFolder.id}`,
        label: designFolder.fileName,
        description: designFolder.spaceName,
        icon: getDataSourceIcon(designFolder) ?? Folder,
        tone: "neutral",
        target: { kind: "node", nodeId: designFolder.id },
      });
    }

    pushSkill("skill-dog-adoption-card");

    return result;
  }, []);

  const availableSuggestions = useMemo(
    () =>
      suggestions.filter((suggestion) => {
        const { target } = suggestion;
        const targetId =
          target.kind === "node" ? target.nodeId : target.skillId;
        return !attachedIds.has(targetId);
      }),
    [suggestions, attachedIds]
  );

  const availableSkills = useMemo(
    () => mockSkills.filter((skill) => !attachedIds.has(skill.id)),
    [attachedIds]
  );

  const menuEntries = useMemo(
    () =>
      buildSlashMenuEntries(availableSuggestions, commands, availableSkills),
    [availableSuggestions, commands, availableSkills]
  );

  const filteredMenuEntries = useMemo(() => {
    const trimmed = activeQuery.trim().toLowerCase();
    if (!trimmed) {
      return menuEntries;
    }
    return menuEntries.filter((entry) => {
      const haystack =
        entry.kind === "suggestion"
          ? `${entry.suggestion.label} ${entry.suggestion.description}`
          : entry.kind === "command"
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

  // "Insert" is just a second way to type "/": it inserts the
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

  // Shared by every attach path (knowledge, skills, upload). The "/" and the
  // typed query are replaced by the item's token, so the attachment reads
  // inline in the instructions — and closing the picker comes for free, since
  // there's no trigger left for useSlashTrigger to find.
  const attachItem = ({
    id,
    name,
    icon,
    group,
  }: Omit<AttachedItem, "token">) => {
    const token = buildToken(name);
    setAttachedItems((prev) => [...prev, { id, name, icon, group, token }]);

    if (selectionStart !== null) {
      const start = slashTrigger.triggerIndex;
      const inserted = `${token} `;
      setValue(value.slice(0, start) + inserted + value.slice(selectionStart));
      const nextCaret = start + inserted.length;
      setSelectionStart(nextCaret);
      focusCaret(nextCaret);
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
      icon: getDataSourceIcon(node),
      group: "knowledge",
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

  const attachSkillById = (skillId: string) => {
    const skill = mockSkills.find((candidate) => candidate.id === skillId);
    if (!skill) {
      return;
    }
    attachItem({
      id: skill.id,
      name: skill.name,
      icon: PuzzlePiece01,
      group: "capability",
    });
  };

  const handleSelectMenuEntry = (entry: SlashMenuEntry) => {
    if (entry.kind === "suggestion") {
      const { target } = entry.suggestion;
      if (target.kind === "node") {
        handleSelectItemById(target.nodeId);
      } else {
        attachSkillById(target.skillId);
      }
      return;
    }
    if (entry.kind === "skill") {
      attachSkillById(entry.skill.id);
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
      icon: File01,
      group: "file",
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

  const handleInsertClick = () => {
    if (isPickerOpen) {
      closeInlinePicker();
      return;
    }
    insertSlashTrigger();
  };

  // The handler closes over this render's value/caret, so the host gets a
  // stable wrapper reading the latest one instead of a new function each
  // render (which would loop through the host's setState).
  const insertClickRef = useRef(handleInsertClick);
  useEffect(() => {
    insertClickRef.current = handleInsertClick;
  });
  const publishedInsert = useCallback(() => insertClickRef.current(), []);
  useEffect(() => {
    onAddKnowledge?.(publishedInsert);
  }, [onAddKnowledge, publishedInsert]);

  return (
    <div className={cn("flex w-full max-w-lg flex-col gap-1.5", className)}>
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
          sharing the input's border/background. Skipped when the host has
          taken the action over. */}
      {!onAddKnowledge && (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="outline"
            label="Insert"
            icon={Plus}
            // Keeps focus in the textarea: without this the mousedown blurs
            // it, which closes the picker the click is meant to open (and
            // loses the caret position the "/" has to land on).
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleInsertClick}
          />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-2xl border bg-background p-1 transition-colors duration-150",
          isTextareaFocused
            ? "border-border-focus ring-2 ring-highlight/20"
            : "border-border"
        )}
      >
        <div className="relative">
          {(showInlineHint || tokens.length > 0) && (
            <div
              aria-hidden="true"
              // A mirror of the textarea's own text, not a label pinned to
              // measured caret coordinates: an identical block produces
              // identical line boxes, so the hint shares the real text's
              // baseline by construction instead of by arithmetic. The
              // padding/type classes are the textarea's own, and inset-px
              // accounts for the padded wrapper TextArea puts around it.
              className="pointer-events-none absolute inset-px overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm text-transparent"
            >
              {showInlineHint ? (
                <>
                  {renderWithTokens(
                    value.slice(0, slashTrigger.triggerIndex),
                    tokens
                  )}
                  {/* The hint text is absolutely positioned so it contributes
                      no width: anything after the caret has to stay lined up
                      with the real text, tokens included. */}
                  <span className={cn(TOKEN_CLASSES, "relative")}>
                    /
                    <span className="absolute left-full top-0 whitespace-pre rounded-r-sm bg-muted-background pr-0.5 text-muted-foreground">
                      Type to search
                    </span>
                  </span>
                  {renderWithTokens(
                    value.slice(slashTrigger.triggerIndex + 1),
                    tokens
                  )}
                </>
              ) : (
                renderWithTokens(value, tokens)
              )}
            </div>
          )}
          <TextArea
            ref={textareaRef}
            value={value}
            minRows={minRows}
            resize="vertical"
            placeholder={placeholder}
            className="relative z-10 border-none bg-transparent shadow-none focus-visible:ring-0"
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
              const nextValue = e.target.value;
              setValue(nextValue);
              syncSelection(e.target);
              // Erasing a token is how an attachment is removed — there is no
              // delete control, so the text is the source of truth.
              setAttachedItems((prev) =>
                prev.filter((item) => nextValue.includes(item.token))
              );
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
        </div>
      </div>

      <AttachedKnowledgeGroups items={attachedItems} />

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
