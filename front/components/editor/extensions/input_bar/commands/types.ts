import type { InputBarSlashSuggestionCapability } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type { SlashCommand } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Editor } from "@tiptap/core";

export type InputBarSlashCommandKind =
  InputBarSlashSuggestionCapability["kind"];

export type InputBarSlashCommandCapabilityOfKind<
  K extends InputBarSlashCommandKind,
> = Extract<InputBarSlashSuggestionCapability, { kind: K }>;

// Affordances the input bar container exposes to slash command selection handlers.
export interface InputBarSlashCommandSelectContext {
  editor: Editor | null;
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
}

// Affordances the input bar container exposes to open the details sheet of a slash command
// target.
export interface InputBarSlashCommandDetailsContext {
  openSkillDetails: (skillId: string) => void;
  openToolDetails: (serverView: MCPServerViewType) => void;
}

// Per-kind definition of an input bar slash command: how it renders in the dropdown and what
// selecting it or opening its details does. Each kind lives in its own module under commands/
// and is wired in the exhaustive dispatchers of commands/index.ts.
export interface InputBarSlashCommandDefinition<
  K extends InputBarSlashCommandKind,
> {
  kind: K;
  getItem: (
    capability: InputBarSlashCommandCapabilityOfKind<K>
  ) => SlashCommand;
  onSelect: (
    capability: InputBarSlashCommandCapabilityOfKind<K>,
    context: InputBarSlashCommandSelectContext
  ) => void;
  onDetails: (
    capability: InputBarSlashCommandCapabilityOfKind<K>,
    context: InputBarSlashCommandDetailsContext
  ) => void;
}
