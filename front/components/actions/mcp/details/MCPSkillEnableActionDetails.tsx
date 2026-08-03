import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import {
  getOutputText,
  isResourceContentWithText,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isSkillEnableInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { getEnableSkillIdFromOutputBlock } from "@app/lib/api/actions/servers/skill_management/rendering";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkill } from "@app/lib/swr/skill_configurations";
import {
  getManageSkillsRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import { IconButton, LinkExternal01, Spinner } from "@dust-tt/sparkle";

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
    withRelations: true,
    disabled: !shouldFetchSkill,
  });

  const showSidebarDetails =
    displayContext !== "conversation" &&
    (shouldFetchSkill || outputItems.length > 0);

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      headerAction={
        displayContext !== "conversation" && enabledSkillId ? (
          <IconButton
            href={
              skill?.canAdministrate
                ? getSkillBuilderRoute(owner.sId, enabledSkillId)
                : getManageSkillsRoute(owner.sId, enabledSkillId)
            }
            icon={LinkExternal01}
            size="xs"
            tooltip={skill?.canAdministrate ? "Edit skill" : "View skill"}
          />
        ) : undefined
      }
      visual={SKILL_ICON}
    >
      {showSidebarDetails && (
        <div className="dd-privacy-mask flex flex-col gap-5 py-4 pl-6 text-sm">
          {outputItems.length > 0 && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              {outputItems.map((o, index) => (
                <div key={index} className="whitespace-pre-wrap">
                  {getOutputText(o) ?? ""}
                </div>
              ))}
            </div>
          )}

          {shouldFetchSkill && (
            <div className="flex flex-col gap-4">
              <div className="heading-base text-foreground">Skill details</div>
              {isSkillLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size="xs" />
                  <span>Loading skill details...</span>
                </div>
              ) : isSkillError ? (
                <div className="text-sm text-muted-foreground">
                  Could not load the skill details.
                </div>
              ) : skill ? (
                <SkillInfoTab skill={skill} owner={owner} />
              ) : null}
            </div>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
