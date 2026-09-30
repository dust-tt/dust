import type { InputBarAction } from "@app/components/assistant/conversation/input_bar/inputBarActions";
import { Minimize01, UploadCloud02 } from "@dust-tt/sparkle";
import type React from "react";

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
  description: string;
  icon: React.ComponentType;
  id: InputBarRunCommandId;
  label: string;
}

export const INPUT_BAR_SLASH_COMMANDS: InputBarSlashCommand[] = [
  {
    description: "Upload a file from your device",
    icon: UploadCloud02,
    id: "upload-file",
    label: "Upload file",
  },
  {
    description: "Free up context by summarizing conversation",
    icon: Minimize01,
    id: "compact",
    label: "Compact",
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
