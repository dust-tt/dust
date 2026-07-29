import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { Minimize01, Target04, UploadCloud02 } from "@dust-tt/sparkle";
import type React from "react";

export type InputBarSlashCommandId =
  | "attach-knowledge"
  | "compact"
  | "goal"
  | "upload-file";

/** Run commands backed by `INPUT_BAR_SLASH_COMMANDS` (icon, label, handler via `onSelectRef`). */
export type InputBarRunCommandId = Extract<
  InputBarSlashCommandId,
  "compact" | "goal" | "upload-file"
>;

/** Reorder this list to change display order in the `/` menu. */
export const INPUT_BAR_SLASH_COMMAND_ORDER: InputBarSlashCommandId[] = [
  "goal",
  "compact",
  "upload-file",
  "attach-knowledge",
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
    description: "Keep working autonomously until an objective is complete",
    icon: Target04,
    id: "goal",
    label: "Goal",
  },
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
  hasGoalMode,
}: {
  hasAttachment: boolean;
  hasConversation: boolean;
  hasGoalMode: boolean;
}): InputBarSlashCommand[] {
  return INPUT_BAR_SLASH_COMMANDS.filter((command) => {
    if (command.id === "upload-file") {
      return hasAttachment;
    }

    if (command.id === "compact") {
      return hasConversation;
    }

    if (command.id === "goal") {
      return hasGoalMode;
    }

    return true;
  });
}

export type InputBarSlashCommandSkill = SkillWithoutInstructionsAndToolsType;
