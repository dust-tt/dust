import {
  Chip,
  Icon,
  PuzzlePiece01,
  ScrollArea,
  Planet,
  SearchMd,
  UploadCloud01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import React from "react";

import type { MockSkill } from "../data/skills";
import { KNOWLEDGE_LISTBOX_ID } from "./KnowledgeSuggestionPanel";
import type { RowAvatarTone } from "./KnowledgeRow";
import {
  PanelSectionHeader,
  ROW_CLASSES,
  ROW_DESCRIPTION_CLASSES,
  RowAvatar,
} from "./KnowledgeRow";

export type SlashCommandId = "knowledge" | "upload";

export interface SlashCommand {
  id: SlashCommandId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

// The "/" trigger's first level: a Notion-style command menu. Skills live
// right in it rather than behind their own sub-step — there's usually only a
// handful and picking one is a single action, same as picking a command —
// but they get their own "Capabilities" section so the two kinds stay
// visually distinct.
const UPLOAD_COMMAND: SlashCommand = {
  id: "upload",
  label: "Upload file",
  description: "Upload a file from your device",
  icon: UploadCloud01,
};

const BROWSE_KNOWLEDGE_COMMAND: SlashCommand = {
  id: "knowledge",
  label: "Browse Knowledge",
  description: "Search knowledge and reference conversations",
  icon: Planet,
};

export const SLASH_COMMANDS: SlashCommand[] = [
  UPLOAD_COMMAND,
  BROWSE_KNOWLEDGE_COMMAND,
];

// The skill builder has its own Files section, so offering an upload here too
// would be a second, competing way to do the same thing.
export const SKILL_BUILDER_SLASH_COMMANDS: SlashCommand[] = [
  BROWSE_KNOWLEDGE_COMMAND,
];

// One flat list mixing commands and skills — typing filters both together,
// and arrow-key navigation moves through them as a single sequence. `id` is
// denormalized onto every entry so generic list code (active-item lookup,
// keyboard nav) doesn't need to branch on `kind` just to find it. The
// sections below are purely a rendering concern layered on top of this
// order, which is what keeps the visual order and the nav order identical.
// What a suggestion attaches when picked. Kept as data rather than a
// callback so the menu stays a pure renderer.
export type SlashSuggestionTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "skill"; skillId: string };

export interface SlashSuggestion {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: RowAvatarTone;
  target: SlashSuggestionTarget;
  // Small trailing tag, e.g. "New".
  tag?: string;
}

export type SlashMenuEntry =
  | { kind: "suggestion"; id: string; suggestion: SlashSuggestion }
  | { kind: "command"; id: string; command: SlashCommand }
  | { kind: "skill"; id: string; skill: MockSkill };

function getSlashMenuEntryLabel(entry: SlashMenuEntry): string {
  switch (entry.kind) {
    case "suggestion":
      return entry.suggestion.label;
    case "command":
      return entry.command.label;
    case "skill":
      return entry.skill.name;
  }
}

function getSlashMenuEntryDescription(entry: SlashMenuEntry): string {
  switch (entry.kind) {
    case "suggestion":
      return entry.suggestion.description;
    case "command":
      return entry.command.description;
    case "skill":
      return entry.skill.description;
  }
}

function getSlashMenuEntryIcon(
  entry: SlashMenuEntry
): ComponentType<{ className?: string }> {
  switch (entry.kind) {
    case "suggestion":
      return entry.suggestion.icon;
    case "command":
      return entry.command.icon;
    case "skill":
      return PuzzlePiece01;
  }
}

function getSlashMenuEntryTone(entry: SlashMenuEntry): RowAvatarTone {
  switch (entry.kind) {
    case "suggestion":
      return entry.suggestion.tone;
    case "command":
      return "neutral";
    case "skill":
      return "skill";
  }
}

export function buildSlashMenuEntries(
  suggestions: SlashSuggestion[],
  commands: SlashCommand[],
  skills: MockSkill[]
): SlashMenuEntry[] {
  return [
    ...suggestions.map(
      (suggestion): SlashMenuEntry => ({
        kind: "suggestion",
        id: suggestion.id,
        suggestion,
      })
    ),
    ...commands.map(
      (command): SlashMenuEntry => ({
        kind: "command",
        id: command.id,
        command,
      })
    ),
    ...skills.map(
      (skill): SlashMenuEntry => ({ kind: "skill", id: skill.id, skill })
    ),
  ];
}

function SimpleListRow({
  id,
  icon,
  tone,
  label,
  description,
  tag,
  isActive,
  onHover,
  onSelect,
}: {
  id: string;
  icon: ComponentType<{ className?: string }>;
  tone: RowAvatarTone;
  label: string;
  description: string;
  tag?: string;
  isActive: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isActive) {
      // "nearest" is a no-op when the row is already visible, so hovering
      // never yanks the list around.
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isActive]);

  return (
    <div
      ref={rowRef}
      id={id}
      role="option"
      aria-selected={isActive}
      data-active={isActive || undefined}
      onMouseEnter={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={ROW_CLASSES}
    >
      <RowAvatar icon={icon} tone={tone} />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate">{label}</span>
        <span className={ROW_DESCRIPTION_CLASSES}>{description}</span>
      </div>
      {tag && (
        <Chip size="mini" color="highlight" label={tag} className="shrink-0" />
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-3 text-center">
      <div className="rounded-full bg-muted-background p-2.5">
        <Icon visual={SearchMd} size="md" className="text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// Order matters: it has to match the order `buildSlashMenuEntries` puts
// entries in, or the sections would render out of keyboard-nav order.
const SECTIONS: Array<{ kind: SlashMenuEntry["kind"]; label: string }> = [
  { kind: "suggestion", label: "Suggested" },
  { kind: "command", label: "Commands" },
  { kind: "skill", label: "Capabilities" },
];

interface SlashCommandMenuProps {
  entries: SlashMenuEntry[];
  activeId: string | null;
  onHover: (id: string) => void;
  onSelect: (entry: SlashMenuEntry) => void;
}

export function SlashCommandMenu({
  entries,
  activeId,
  onHover,
  onSelect,
}: SlashCommandMenuProps) {
  return (
    <div className="flex w-80 flex-col">
      <ScrollArea
        id={KNOWLEDGE_LISTBOX_ID}
        role="listbox"
        className="px-1.5 py-1.5"
        viewportClassName="max-h-72"
        onMouseDown={(e) => e.preventDefault()}
      >
        {entries.length === 0 ? (
          <EmptyState message="No matching command" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {SECTIONS.map(({ kind, label }) => {
              // Partitioning preserves the incoming order, and commands
              // always precede skills in it — so each section stays a
              // contiguous run and arrow-key order matches what's on screen.
              const sectionEntries = entries.filter(
                (entry) => entry.kind === kind
              );
              if (sectionEntries.length === 0) {
                return null;
              }
              return (
                <div key={kind} className="flex flex-col">
                  <PanelSectionHeader label={label} />
                  {sectionEntries.map((entry) => (
                    <SimpleListRow
                      key={entry.id}
                      id={entry.id}
                      icon={getSlashMenuEntryIcon(entry)}
                      tone={getSlashMenuEntryTone(entry)}
                      tag={
                        entry.kind === "suggestion"
                          ? entry.suggestion.tag
                          : undefined
                      }
                      label={getSlashMenuEntryLabel(entry)}
                      description={getSlashMenuEntryDescription(entry)}
                      isActive={entry.id === activeId}
                      onHover={() => onHover(entry.id)}
                      onSelect={() => onSelect(entry)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
