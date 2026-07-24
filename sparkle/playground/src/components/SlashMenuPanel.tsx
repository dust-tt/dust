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

export type SlashCommandId = "knowledge" | "upload" | "skills";

export interface SlashCommand {
  id: SlashCommandId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

// The "/" trigger's first step: a small command menu, Notion-style. Picking
// "Attach knowledge" hands off to the browse/search panel already built;
// "Upload file" and "Attach skills" are their own short flows.
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
  {
    id: "skills",
    label: "Attach skills",
    description: "Use an existing skill",
    icon: PuzzlePiece01,
  },
];

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
  commands: SlashCommand[];
  activeId: string | null;
  onHover: (id: string) => void;
  onSelect: (command: SlashCommand) => void;
}

export function SlashCommandMenu({
  commands,
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
        {commands.length === 0 ? (
          <EmptyState message="No matching command" />
        ) : (
          <div className="flex flex-col gap-0.5">
            {commands.map((command) => (
              <SimpleListRow
                key={command.id}
                id={command.id}
                icon={command.icon}
                label={command.label}
                description={command.description}
                isActive={command.id === activeId}
                onHover={() => onHover(command.id)}
                onSelect={() => onSelect(command)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
      <PanelFooterHints />
    </div>
  );
}

interface SkillsPanelProps {
  skills: MockSkill[];
  query: string;
  activeId: string | null;
  onHover: (id: string) => void;
  onSelect: (skill: MockSkill) => void;
}

export function SkillsPanel({
  skills,
  query,
  activeId,
  onHover,
  onSelect,
}: SkillsPanelProps) {
  return (
    <div className="flex w-80 flex-col">
      <ScrollArea
        id={KNOWLEDGE_LISTBOX_ID}
        role="listbox"
        className="h-72 px-1.5 py-1.5"
        onMouseDown={(e) => e.preventDefault()}
      >
        {skills.length === 0 ? (
          <EmptyState
            message={
              query.trim()
                ? `No skills found for “${query}”`
                : "No skills available"
            }
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {skills.map((skill) => (
              <SimpleListRow
                key={skill.id}
                id={skill.id}
                icon={PuzzlePiece01}
                label={skill.name}
                description={skill.description}
                isActive={skill.id === activeId}
                onHover={() => onHover(skill.id)}
                onSelect={() => onSelect(skill)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
      <PanelFooterHints />
    </div>
  );
}
