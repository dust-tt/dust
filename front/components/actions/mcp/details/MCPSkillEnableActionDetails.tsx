import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  getOutputText,
  isResourceContentWithText,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isSkillEnableInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { SKILL_ICON } from "@app/lib/skill";
import { ContentMessage } from "@dust-tt/sparkle";

export function MCPSkillEnableActionDetails({
  displayContext,
  toolParams,
  toolOutput,
}: ToolExecutionDetailsProps) {
  const skillName = isSkillEnableInputType(toolParams)
    ? toolParams.skillName
    : null;

  const actionName =
    (displayContext === "conversation" ? "Enabling skill" : "Enable skill") +
    (skillName ? `: ${skillName}` : "");

  const outputItems = toolOutput
    ? toolOutput.filter((o) => isTextContent(o) || isResourceContentWithText(o))
    : [];

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={SKILL_ICON}
    >
      {displayContext !== "conversation" && outputItems.length > 0 && (
        <div className="dd-privacy-mask flex flex-col gap-4 py-4 pl-6">
          <div>
            <span className="font-medium text-foreground dark:text-foreground-night">
              Output
            </span>
            <div className="my-2 flex flex-col gap-2">
              {outputItems.map((o, index) => (
                <ContentMessage key={index} variant="primary" size="lg">
                  {getOutputText(o) ?? ""}
                </ContentMessage>
              ))}
            </div>
          </div>
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
