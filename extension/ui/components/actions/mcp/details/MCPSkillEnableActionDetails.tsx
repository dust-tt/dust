import { PuzzleIcon } from "@dust-tt/sparkle";
import { isSkillEnableInputType } from "@extension/shared/lib/tool_inputs";
import { ActionDetailsWrapper } from "@extension/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@extension/ui/components/actions/mcp/details/MCPActionDetails";

export function MCPSkillEnableActionDetails({
  action: { params },
  viewType,
}: MCPActionDetailsProps) {
  const skillName = isSkillEnableInputType(params) ? params.skillName : null;

  const actionName =
    (viewType === "conversation" ? "Enabling skill" : "Enable skill") +
    (skillName ? `: ${skillName}` : "");

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={PuzzleIcon}
    />
  );
}
