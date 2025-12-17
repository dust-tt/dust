import {
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  ContentMessage,
  EmptyCTA,
  Hoverable,
  Spinner,
  ToolsIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import { usePresetActionHandler } from "@app/components/agent_builder/capabilities/usePresetActionHandler";
import { SkillsSheet } from "@app/components/agent_builder/skills/skillSheet/SkillsSheet";
import type { SkillsSheetMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { ActionCard } from "@app/components/shared/tools_picker/ActionCard";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { BACKGROUND_IMAGE_STYLE_PROPS } from "@app/components/shared/tools_picker/util";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import type { TemplateActionPreset, UserType, WorkspaceType } from "@app/types";
import { pluralize } from "@app/types";

interface SkillCardProps {
  skill: AgentBuilderSkillsType;
  onRemove: () => void;
  onClick?: () => void;
}

function SkillCard({ skill, onRemove, onClick }: SkillCardProps) {
  const SkillIcon = SKILL_ICON;

  return (
    <Card
      variant="primary"
      className="h-28 cursor-pointer"
      onClick={onClick}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: Event) => {
            onRemove();
            e.stopPropagation();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <SkillIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{skill.name}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{skill.description}</span>
        </div>
      </div>
    </Card>
  );
}

interface AgentBuilderSkillsBlockProps {
  isActionsLoading: boolean;
  isSkillsLoading?: boolean;
  owner: WorkspaceType;
  user: UserType;
}

export function AgentBuilderSkillsBlock({
  isActionsLoading,
  isSkillsLoading,
  owner,
  user,
}: AgentBuilderSkillsBlockProps) {
  const { getValues, setValue, watch } = useFormContext<AgentBuilderFormData>();

  // Actions (tools) field array
  const {
    fields: actionFields,
    remove: removeAction,
    append: appendAction,
    update: updateAction,
  } = useFieldArray<AgentBuilderFormData, "actions">({
    name: "actions",
  });

  // Skills field array
  const { fields: skillFields, remove: removeSkill } = useFieldArray<
    AgentBuilderFormData,
    "skills"
  >({
    name: "skills",
  });

  const {
    mcpServerViewsWithKnowledge,
    mcpServerViews,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

  const { spaces } = useSpacesContext();
  const { owner: contextOwner } = useAgentBuilderContext();
  // TODO(skills Jules): make a pass on the way we use reacthookform here
  const { skills: allSkills } = useSkillsContext();

  const { skillsWithRelations: skills, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({
      owner: contextOwner,
      status: "active",
    });

  const actions = watch("actions");
  const selectedSkills = watch("skills");
  const additionalSpaces = watch("additionalSpaces");

  // Compute space IDs already requested by actions (tools/knowledge)
  const alreadyRequestedSpaceIds = useMemo(() => {
    const spaceIdToActions = getSpaceIdToActionsMap(actions, mcpServerViews);
    const actionRequestedSpaceIds = new Set<string>();
    for (const spaceId of Object.keys(spaceIdToActions)) {
      if (spaceIdToActions[spaceId]?.length > 0) {
        actionRequestedSpaceIds.add(spaceId);
      }
    }

    // Also include space IDs from custom skills (those with canWrite: true have their own requestedSpaceIds)
    const selectedSkillIds = new Set(selectedSkills.map((s) => s.sId));
    for (const skill of allSkills) {
      if (selectedSkillIds.has(skill.sId) && skill.canWrite) {
        for (const spaceId of skill.requestedSpaceIds) {
          actionRequestedSpaceIds.add(spaceId);
        }
      }
    }

    return actionRequestedSpaceIds;
  }, [actions, mcpServerViews, selectedSkills, allSkills]);

  // Sheet state
  const [sheetMode, setSheetMode] = useState<SkillsSheetMode | null>(null);
  const [knowledgeAction, setKnowledgeAction] = useState<{
    action: BuilderAction;
    index: number | null;
    presetData?: TemplateActionPreset;
  } | null>(null);

  // Preset action handler for templates
  usePresetActionHandler({
    fields: actionFields,
    append: appendAction,
    setKnowledgeAction,
  });

  // Compute non-global spaces used in actions for the warning message
  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    return nonGlobalSpaces.filter((s) => spaceIdToActions[s.sId]?.length > 0);
  }, [spaceIdToActions, spaces]);

  const handleOpenSheet = useCallback(() => {
    setSheetMode({
      type: SKILLS_SHEET_PAGE_IDS.SELECTION,
    });
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSheetMode(null);
    setKnowledgeAction(null);
  }, []);

  const handleSaveSkills = useCallback(
    (newSkills: AgentBuilderSkillsType[], newAdditionalSpaces: string[]) => {
      setValue("skills", newSkills, { shouldDirty: true });
      setValue("additionalSpaces", newAdditionalSpaces, { shouldDirty: true });
    },
    [setValue]
  );

  const handleEditSave = (updatedAction: BuilderAction) => {
    if (knowledgeAction && knowledgeAction.index !== null) {
      updateAction(knowledgeAction.index, updatedAction);
    } else {
      appendAction(updatedAction);
    }
    setKnowledgeAction(null);
  };

  const handleActionEdit = (action: BuilderAction, index: number) => {
    const mcpServerView = mcpServerViewsWithKnowledge.find(
      (view) => view.sId === action.configuration?.mcpServerViewId
    );
    const isDataSourceSelectionRequired =
      action.type === "MCP" && Boolean(mcpServerView);

    if (isDataSourceSelectionRequired) {
      setKnowledgeAction({ action, index });
    } else {
      setSheetMode(
        action.configurationRequired
          ? { type: SKILLS_SHEET_PAGE_IDS.TOOL_EDIT, action, index }
          : {
              type: SKILLS_SHEET_PAGE_IDS.TOOL_INFO,
              action,
              source: "addedTool",
            }
      );
    }
  };

  const handleSkillClick = (skillSId: string) => {
    const skill = skills.find((s) => s.sId === skillSId);
    if (skill) {
      setSheetMode({
        type: SKILLS_SHEET_PAGE_IDS.SKILL_INFO,
        skill,
        source: "addedSkill",
      });
    }
  };

  const handleMcpActionUpdate = (action: BuilderAction, index: number) => {
    updateAction(index, action);
  };

  const onClickKnowledge = () => {
    const action = getDefaultMCPAction();
    setKnowledgeAction({
      action: {
        ...action,
        configurationRequired: true,
      },
      index: null,
    });
  };

  const getAgentInstructions = () => getValues("instructions");

  const isLoading =
    isMCPServerViewsLoading ||
    isActionsLoading ||
    (isSkillsLoading ?? false) ||
    isSkillsWithRelationsLoading;
  const hasCapabilities = actionFields.length > 0 || skillFields.length > 0;

  const headerActions = hasCapabilities && (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        onClick={onClickKnowledge}
        label="Add knowledge"
        icon={BookOpenIcon}
        variant="primary"
      />
      <Button
        type="button"
        onClick={handleOpenSheet}
        label="Add capabilities"
        icon={ToolsIcon}
        variant="outline"
      />
    </div>
  );

  return (
    <AgentBuilderSectionContainer
      title="Knowledge, Tools & Skills"
      description={
        <>
          Add knowledge, tools and skills to enhance your agent's abilities.
          Need help? Check our{" "}
          <Hoverable
            variant="primary"
            href="https://docs.dust.tt/docs/tools"
            target="_blank"
          >
            guide
          </Hoverable>
          .
        </>
      }
      headerActions={headerActions}
    >
      <div className="flex-1">
        {isLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : !hasCapabilities ? (
          <EmptyCTA
            action={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={onClickKnowledge}
                  label="Add knowledge"
                  icon={BookOpenIcon}
                  variant="primary"
                />
                <Button
                  type="button"
                  onClick={handleOpenSheet}
                  label="Add capabilities"
                  icon={ToolsIcon}
                  variant="outline"
                />
              </div>
            }
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
          <>
            {nonGlobalSpacesUsedInActions.length > 0 && (
              <div className="mb-4 w-full">
                <ContentMessage variant="golden" size="lg">
                  Based on your selection, this agent can only be used by users
                  with access to space
                  {pluralize(nonGlobalSpacesUsedInActions.length)} :{" "}
                  <strong>
                    {nonGlobalSpacesUsedInActions.map((v) => v.name).join(", ")}
                  </strong>
                  .
                </ContentMessage>
              </div>
            )}
            <CardGrid>
              {skillFields.map((field, index) => (
                <SkillCard
                  key={field.id}
                  skill={field}
                  onRemove={() => removeSkill(index)}
                  onClick={() => handleSkillClick(field.sId)}
                />
              ))}
              {actionFields.map((field, index) => (
                <ActionCard
                  key={field.id}
                  action={field}
                  onRemove={() => removeAction(index)}
                  onEdit={() => handleActionEdit(field, index)}
                />
              ))}
            </CardGrid>
          </>
        )}
      </div>
      <KnowledgeConfigurationSheet
        onClose={handleCloseSheet}
        onSave={handleEditSave}
        action={knowledgeAction?.action ?? null}
        actions={actionFields}
        isEditing={Boolean(knowledgeAction && knowledgeAction.index !== null)}
        mcpServerViews={mcpServerViewsWithKnowledge}
        getAgentInstructions={getAgentInstructions}
        presetActionData={knowledgeAction?.presetData}
      />
      <SkillsSheet
        mode={sheetMode}
        onClose={handleCloseSheet}
        onSave={handleSaveSkills}
        onModeChange={setSheetMode}
        owner={owner}
        user={user}
        initialSelectedSkills={selectedSkills}
        initialAdditionalSpaces={additionalSpaces}
        alreadyRequestedSpaceIds={alreadyRequestedSpaceIds}
        addTools={appendAction}
        onActionUpdate={handleMcpActionUpdate}
        selectedActions={actionFields}
        getAgentInstructions={getAgentInstructions}
      />
    </AgentBuilderSectionContainer>
  );
}
