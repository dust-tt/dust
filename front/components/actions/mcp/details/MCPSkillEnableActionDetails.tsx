import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { SkillInstructionsReadOnlyEditor } from "@app/components/skills/SkillInstructionsReadOnlyEditor";
import {
  getOutputText,
  isResourceContentWithText,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isSkillEnableInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { getEnableSkillIdFromOutputBlock } from "@app/lib/api/actions/servers/skill_management/rendering";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { ContentMessage, Spinner } from "@dust-tt/sparkle";

export function MCPSkillEnableActionDetails({
  owner,
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

  const enabledSkillId =
    toolOutput
      ?.map(getEnableSkillIdFromOutputBlock)
      .find((skillId): skillId is string => skillId !== null) ?? null;
  const shouldFetchSkill =
    displayContext !== "conversation" && enabledSkillId !== null;
  const { skill, isSkillLoading, isSkillError } = useSkill({
    workspaceId: owner.sId,
    skillId: enabledSkillId,
    disabled: !shouldFetchSkill,
  });

  const instructions = skill?.instructions ?? "";
  const hasInstructions = instructions.trim().length > 0;
  const showInstructionsSection =
    shouldFetchSkill && (isSkillLoading || isSkillError || hasInstructions);
  const showSidebarDetails =
    displayContext !== "conversation" &&
    (showInstructionsSection || outputItems.length > 0);

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={SKILL_ICON}
    >
      {showSidebarDetails && (
        <div className="dd-privacy-mask flex flex-col gap-4 py-4 pl-6">
          {outputItems.length > 0 && (
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
          )}

          {showInstructionsSection && (
            <div>
              <span className="font-medium text-foreground dark:text-foreground-night">
                Instructions
              </span>
              <div className="my-2">
                {isSkillLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    <Spinner size="xs" />
                    <span>Loading instructions...</span>
                  </div>
                ) : isSkillError ? (
                  <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Could not load the skill instructions.
                  </div>
                ) : hasInstructions ? (
                  <SkillInstructionsReadOnlyEditor
                    content={instructions}
                    htmlContent={skill?.instructionsHtml ?? ""}
                    owner={owner}
                    className="max-h-150 overflow-y-auto"
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
