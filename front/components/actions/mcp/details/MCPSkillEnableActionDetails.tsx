import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isSkillEnableInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { SKILL_ICON } from "@app/lib/skill";

export function MCPSkillEnableActionDetails({
  displayContext,
  toolParams,
}: ToolExecutionDetailsProps) {
  const skillName = isSkillEnableInputType(toolParams)
    ? toolParams.skillName
    : null;

  const actionName =
    (displayContext === "conversation" ? "Enabling skill" : "Enable skill") +
    (skillName ? `: ${skillName}` : "");

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={SKILL_ICON}
    />
  );
}
