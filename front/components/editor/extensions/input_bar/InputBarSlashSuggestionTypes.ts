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

// Narrows the opaque `data` payload of a SlashCommand item back to a capability. Only used on
// items the input bar dropdown built itself, so checking the discriminant is sufficient.
export function isInputBarSlashSuggestionCapability(
  data: unknown
): data is InputBarSlashSuggestionCapability {
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    (data.kind === "skill" || data.kind === "tool")
  );
}
