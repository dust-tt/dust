import { isSkillEnableInputType } from "@app/shared/lib/tool_inputs";
import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { PuzzleIcon } from "@dust-tt/sparkle";

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
