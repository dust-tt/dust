import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isSkillEnableInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { SKILL_ICON } from "@app/lib/skill";

export function MCPSkillEnableActionDetails({
  viewType,
  toolParams,
}: ToolExecutionDetailsProps) {
  const skillName = isSkillEnableInputType(toolParams)
    ? toolParams.skillName
    : null;

  const actionName =
    (viewType === "conversation" ? "Enabling skill" : "Enable skill") +
    (skillName ? `: ${skillName}` : "");

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={SKILL_ICON}
    >
      <></>
    </ActionDetailsWrapper>
  );
}
