import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";

export type InputBarSlashSuggestionCapability =
  | {
      kind: "skill";
      skill: SkillWithoutInstructionsAndToolsType;
    }
  | {
      kind: "tool";
      serverView: MCPServerViewType;
    };
