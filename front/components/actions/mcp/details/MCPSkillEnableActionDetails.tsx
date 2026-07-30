import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { SkillInstructionsReadOnlyEditor } from "@app/components/skills/SkillInstructionsReadOnlyEditor";
import { SkillToolsList } from "@app/components/skills/SkillToolsList";
import {
  getOutputText,
  isResourceContentWithText,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isSkillEnableInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { getEnableSkillIdFromOutputBlock } from "@app/lib/api/actions/servers/skill_management/rendering";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { getManageSkillsRoute } from "@app/lib/utils/router";
import {
  ContentMessage,
  IconButton,
  LinkExternal01,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";

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

  const description = skill?.userFacingDescription.trim() ?? "";
  const hasDescription = description.length > 0;
  const tools = skill?.tools ?? [];
  const hasTools = tools.length > 0;
  const instructions = skill?.instructions ?? "";
  const hasInstructions = instructions.trim().length > 0;
  const showInstructionsSection =
    shouldFetchSkill && (isSkillLoading || isSkillError || hasInstructions);
  const showSkillDetails =
    hasDescription || hasTools || showInstructionsSection;
  const showSidebarDetails =
    displayContext !== "conversation" &&
    (showSkillDetails || outputItems.length > 0);

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      headerAction={
        displayContext !== "conversation" && enabledSkillId ? (
          <IconButton
            href={getManageSkillsRoute(owner.sId, enabledSkillId)}
            icon={LinkExternal01}
            size="xs"
            tooltip="View skill"
          />
        ) : undefined
      }
      visual={SKILL_ICON}
    >
      {showSidebarDetails && (
        <div className="dd-privacy-mask flex flex-col gap-5 py-4 pl-6">
          {outputItems.length > 0 && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              {outputItems.map((o, index) => (
                <div key={index} className="whitespace-pre-wrap">
                  {getOutputText(o) ?? ""}
                </div>
              ))}
            </div>
          )}

          {showSkillDetails && (
            <div className="flex flex-col gap-4">
              <div className="heading-base text-foreground">Skill details</div>

              <div className="flex flex-col gap-5">
                {hasDescription && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Description
                    </span>
                    <ContentMessage variant="primary" size="lg">
                      <Markdown
                        content={description}
                        isStreaming={false}
                        forcedTextSize="text-sm"
                        textColor="text-muted-foreground"
                        isLastMessage={false}
                      />
                    </ContentMessage>
                  </div>
                )}

                {hasTools && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Tools
                    </span>
                    <SkillToolsList tools={tools} />
                  </div>
                )}

                {showInstructionsSection && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Instructions
                    </span>
                    {isSkillLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner size="xs" />
                        <span>Loading instructions...</span>
                      </div>
                    ) : isSkillError ? (
                      <div className="text-sm text-muted-foreground">
                        Could not load the skill instructions.
                      </div>
                    ) : hasInstructions ? (
                      <SkillInstructionsReadOnlyEditor
                        content={instructions}
                        htmlContent={skill?.instructionsHtml ?? ""}
                        owner={owner}
                        className="min-h-0 max-h-150 overflow-y-auto"
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
