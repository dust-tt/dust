import type { InputBarAction } from "@app/components/assistant/conversation/input_bar/inputBarActions";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { Minimize01, UploadCloud02 } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type React from "react";
import type { RefObject } from "react";

// What the "/" menu offers a composer: the command list with capabilities, or only the knowledge
// browser.
export type InputBarSlashMenuMode = "commands" | "attach-only";

/**
 * @cc [owner:smb2268,label:product] slash-menu-mode-from-actions
 * A composer with the `capabilities` action MUST get the `commands` menu, one with `attachment`
 * but not `capabilities` MUST get `attach-only`, and one with neither MUST get `null`, meaning no
 * slash menu and no "+" (the extension composer's "+" is built by the container).
 */
export function getInputBarSlashMenuMode(
  actions: InputBarAction[]
): InputBarSlashMenuMode | null {
  if (actions.includes("capabilities")) {
    return "commands";
  }
  return actions.includes("attachment") ? "attach-only" : null;
}

export interface InputBarSlashMenuRefs {
  conversationIdRef?: RefObject<string | null>;
  includeAttachKnowledgeRef: RefObject<boolean>;
  includePickModelRef: RefObject<boolean>;
  includeSelectSpacesRef: RefObject<boolean>;
  onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
  onModelSelectRef: RefObject<((selection: Selection) => void) | undefined>;
  onNodeSelectRef: RefObject<
    ((node: DataSourceViewContentNode) => void) | undefined
  >;
  onSelectRef: RefObject<((item: SlashCommand) => void) | undefined>;
  slashCommandsRef: RefObject<InputBarSlashCommand[]>;
  slashMenuModeRef: RefObject<InputBarSlashMenuMode | null>;
  spaceIdRef: RefObject<string | null | undefined>;
}

export type InputBarSlashCommandId =
  | "attach-knowledge"
  | "compact"
  | "pick-model"
  | "select-spaces"
  | "upload-file";

/** Run commands backed by `INPUT_BAR_SLASH_COMMANDS` (icon, label, handler via `onSelectRef`). */
export type InputBarRunCommandId = Extract<
  InputBarSlashCommandId,
  "compact" | "upload-file"
>;

/** Reorder this list to change display order in the `/` menu. */
export const INPUT_BAR_SLASH_COMMAND_ORDER: InputBarSlashCommandId[] = [
  "attach-knowledge",
  "upload-file",
  "pick-model",
  "compact",
  "select-spaces",
];

// Static command offered by the input bar `/` dropdown, as opposed to workspace capabilities
// (skills and tools) which are fetched.
export interface InputBarSlashCommand {
  description: MessageDescriptor;
  icon: React.ComponentType;
  id: InputBarRunCommandId;
  label: MessageDescriptor;
}

export const INPUT_BAR_SLASH_COMMANDS: InputBarSlashCommand[] = [
  {
    description: msg`Upload a file from your device`,
    icon: UploadCloud02,
    id: "upload-file",
    label: msg`Upload file`,
  },
  {
    description: msg`Free up context by summarizing the conversation`,
    icon: Minimize01,
    id: "compact",
    label: msg`Compact`,
  },
];

export function getAvailableInputBarSlashCommands({
  hasAttachment,
  hasConversation,
}: {
  hasAttachment: boolean;
  hasConversation: boolean;
}): InputBarSlashCommand[] {
  return INPUT_BAR_SLASH_COMMANDS.filter((command) => {
    if (command.id === "upload-file") {
      return hasAttachment;
    }

    if (command.id === "compact") {
      return hasConversation;
    }

    return true;
  });
}
