import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { Minimize01, UploadCloud02 } from "@dust-tt/sparkle";
import type React from "react";

export type InputBarSlashCommandId = "compact" | "upload-file";

// Static command offered by the input bar `/` dropdown, as opposed to workspace capabilities
// (skills and tools) which are fetched.
export interface InputBarSlashCommand {
  description: string;
  icon: React.ComponentType;
  id: InputBarSlashCommandId;
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
    label: "compact",
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

export type InputBarSlashCommandSkill = SkillWithoutInstructionsAndToolsType;
