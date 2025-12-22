import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { SKILL_ICON } from "@app/lib/skill";

function isSkillEnableParams(params: unknown): params is { skillName: string } {
  return (
    typeof params === "object" &&
    params !== null &&
    "skillName" in params &&
    typeof (params as { skillName: unknown }).skillName === "string"
  );
}

export function MCPSkillEnableActionDetails({
  viewType,
  toolParams,
}: ToolExecutionDetailsProps) {
  const skillName = isSkillEnableParams(toolParams)
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
