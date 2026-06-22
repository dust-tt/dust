import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { Minimize01 } from "@dust-tt/sparkle";
import type React from "react";

export type InputBarSlashCommandId = "compact";

// Static command offered by the input bar `/` dropdown, as opposed to workspace capabilities
// (skills and tools) which are fetched.
export interface InputBarSlashCommand {
  description: string;
  icon: React.ComponentType;
  id: InputBarSlashCommandId;
  label: string;
}

// Static commands require an existing conversation to operate on; the dropdown only offers them
// when one is present.
export const INPUT_BAR_SLASH_COMMANDS: InputBarSlashCommand[] = [
  {
    description: "Free up context by summarizing conversation",
    icon: Minimize01,
    id: "compact",
    label: "compact",
  },
];

export type InputBarSlashCommandSkill = SkillWithoutInstructionsAndToolsType;
