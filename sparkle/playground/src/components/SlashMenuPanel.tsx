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
import { PanelSectionHeader } from "./KnowledgeRow";

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
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "upload",
    label: "Upload file",
    description: "Upload a file from your device",
    icon: UploadCloud01,
  },
  {
    id: "knowledge",
    label: "Attach knowledge",
    description: "Search knowledge and reference conversations",
    icon: Attachment01,
  },
];

// One flat list mixing commands and skills — typing filters both together,
// and arrow-key navigation moves through them as a single sequence. `id` is
// denormalized onto every entry so generic list code (active-item lookup,
// keyboard nav) doesn't need to branch on `kind` just to find it. The
// sections below are purely a rendering concern layered on top of this
// order, which is what keeps the visual order and the nav order identical.
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
