import {
  Attachment01,
  Icon,
  PuzzlePiece01,
  ScrollArea,
  SearchMd,
  UploadCloud01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import React from "react";

import type { MockSkill } from "../data/skills";
import { KNOWLEDGE_LISTBOX_ID } from "./KnowledgeSuggestionPanel";

export type SlashCommandId = "knowledge" | "upload";

export interface SlashCommand {
  id: SlashCommandId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

// The "/" trigger's first level: a Notion-style command menu, but skills
// live right in it as regular entries — not behind their own sub-step —
// since there's usually only a handful and picking one is a single action,
// same as picking a command.
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "knowledge",
    label: "Attach knowledge",
    description: "Search or browse spaces and folders",
    icon: Attachment01,
  },
  {
    id: "upload",
    label: "Upload file",
    description: "Add a file from your computer",
    icon: UploadCloud01,
  },
];

// One flat list mixing commands and skills — typing filters both together,
// and arrow-key navigation moves through them as a single sequence. `id` is
// denormalized onto every entry so generic list code (active-item lookup,
// keyboard nav) doesn't need to branch on `kind` just to find it.
export type SlashMenuEntry =
  | { kind: "command"; id: string; command: SlashCommand }
  | { kind: "skill"; id: string; skill: MockSkill };

function getSlashMenuEntryLabel(entry: SlashMenuEntry): string {
  return entry.kind === "command" ? entry.command.label : entry.skill.name;
}

function getSlashMenuEntryDescription(entry: SlashMenuEntry): string {
  return entry.kind === "command"
    ? entry.command.description
    : entry.skill.description;
}

function getSlashMenuEntryIcon(
  entry: SlashMenuEntry
): ComponentType<{ className?: string }> {
  return entry.kind === "command" ? entry.command.icon : PuzzlePiece01;
}

export function buildSlashMenuEntries(
  commands: SlashCommand[],
  skills: MockSkill[]
): SlashMenuEntry[] {
  return [
    ...commands.map(
      (command): SlashMenuEntry => ({ kind: "command", id: command.id, command })
    ),
    ...skills.map(
      (skill): SlashMenuEntry => ({ kind: "skill", id: skill.id, skill })
    ),
  ];
}

function SimpleListRow({
  id,
  icon,
  label,
  description,
  isActive,
  onHover,
  onSelect,
}: {
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  isActive: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isActive}
      data-active={isActive || undefined}
      onMouseEnter={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 transition-[background-color,transform] duration-100 ease-out motion-safe:active:scale-[0.98] data-[active]:bg-hover"
    >
      <Icon visual={icon} size="xs" className="shrink-0" />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm text-foreground">{label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {description}
        </span>
      </div>
    </div>
  );
}

function PanelFooterHints() {
  return (
    <div
      className="flex items-center gap-3 border-t border-border px-2.5 py-1.5 text-xs text-muted-foreground"
      onMouseDown={(e) => e.preventDefault()}
    >
      <span className="flex items-center gap-1">
        <Kbd>↑↓</Kbd> Navigate
      </span>
      <span className="flex items-center gap-1">
        <Kbd>↵</Kbd> Select
      </span>
      <span className="flex items-center gap-1">
        <Kbd>Esc</Kbd> Close
      </span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-muted-background px-1 font-sans text-[10px] leading-4">
      {children}
    </kbd>
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
        className="h-auto max-h-72 px-1.5 py-1.5"
        onMouseDown={(e) => e.preventDefault()}
      >
        {entries.length === 0 ? (
          <EmptyState message="No matching command" />
        ) : (
          <div className="flex flex-col gap-0.5">
            {entries.map((entry) => {
              const id = entry.id;
              return (
                <SimpleListRow
                  key={id}
                  id={id}
                  icon={getSlashMenuEntryIcon(entry)}
                  label={getSlashMenuEntryLabel(entry)}
                  description={getSlashMenuEntryDescription(entry)}
                  isActive={id === activeId}
                  onHover={() => onHover(id)}
                  onSelect={() => onSelect(entry)}
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
      <PanelFooterHints />
    </div>
  );
}
