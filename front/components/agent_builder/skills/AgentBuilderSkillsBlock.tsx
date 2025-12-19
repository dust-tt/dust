import {
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  ContentMessage,
  EmptyCTA,
  Spinner,
  ToolsIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { CapabilitiesSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesSheet";
import type { CapabilitiesSheetMode } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { ResourceAvatar } from "@app/components/resources/resources_icons";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { ActionCard } from "@app/components/shared/tools_picker/ActionCard";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { BACKGROUND_IMAGE_STYLE_PROPS } from "@app/components/shared/tools_picker/util";
import { getSkillIcon } from "@app/lib/skill";
import type { TemplateActionPreset, UserType, WorkspaceType } from "@app/types";
import { pluralize } from "@app/types";

interface SkillCardProps {
  skill: AgentBuilderSkillsType;
  onRemove: () => void;
}

function SkillCard({ skill, onRemove }: SkillCardProps) {
  const SkillIcon = getSkillIcon(skill.icon);

  return (
    <Card
      variant="primary"
      className="h-28"
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
          <ResourceAvatar icon={SkillIcon} size="sm" />
          <span className="truncate">{skill.name}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{skill.description}</span>
        </div>
      </div>
    </Card>
  );
}

function ActionButtons({
  onClickKnowledge,
  onClickCapability,
}: {
  onClickKnowledge: () => void;
  onClickCapability: () => void;
}) {
  return (
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
        onClick={onClickCapability}
        label="Add capabilities"
        icon={ToolsIcon}
        variant="outline"
      />
    </div>
  );
}

interface AgentBuilderSkillsBlockProps {
  isSkillsLoading?: boolean;
  owner: WorkspaceType;
  user: UserType;
}

export function AgentBuilderSkillsBlock({
  isSkillsLoading,
  owner,
  user,
}: AgentBuilderSkillsBlockProps) {
  const { getValues, setValue, watch } = useFormContext<AgentBuilderFormData>();
  const { fields: skillFields, remove: removeSkill } = useFieldArray<
    AgentBuilderFormData,
    "skills"
  >({
    name: "skills",
  });
  const {
    fields: actionFields,
    remove: removeAction,
    append: appendAction,
    update: updateAction,
  } = useFieldArray<AgentBuilderFormData, "actions">({
    name: "actions",
  });

  // TODO(skills Jules): make a pass on the way we use reacthookform here
  const { mcpServerViewsWithKnowledge, mcpServerViews } =
    useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();
  const { spaces } = useSpacesContext();

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

  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    return nonGlobalSpaces.filter((s) => spaceIdToActions[s.sId]?.length > 0);
  }, [spaceIdToActions, spaces]);

  const [capabillitiesSheetMode, setCapabilitiesSheetMode] =
    useState<CapabilitiesSheetMode | null>(null);
  const [knowledgeAction, setKnowledgeAction] = useState<{
    action: BuilderAction;
    index: number | null;
    presetData?: TemplateActionPreset;
  } | null>(null);

  const handleToolEditSave = (updatedAction: BuilderAction) => {
    if (capabillitiesSheetMode?.pageId === "tool_edit") {
      updateAction(capabillitiesSheetMode.index, updatedAction);
    } else if (knowledgeAction && knowledgeAction.index !== null) {
      updateAction(knowledgeAction.index, updatedAction);
    } else {
      appendAction(updatedAction);
    }
    setCapabilitiesSheetMode(null);
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
      setCapabilitiesSheetMode(
        action.configurationRequired
          ? { pageId: "tool_edit", capability: action, index }
          : { pageId: "tool_info", capability: action, hasPreviousPage: false }
      );
    }
  };

  const handleSaveSkills = useCallback(
    (skills: AgentBuilderSkillsType[], newAdditionalSpaces: string[]) => {
      setValue("skills", skills, { shouldDirty: true });
      setValue("additionalSpaces", newAdditionalSpaces, { shouldDirty: true });
    },
    [setValue]
  );

  const handleClickKnowledge = () => {
    // We don't know which action will be selected so we will create a generic MCP action.
    const action = getDefaultMCPAction();

    setKnowledgeAction({
      action: {
        ...action,
        configurationRequired: true, // it's always required for knowledge
      },
      index: null,
    });
  };

  const handleClickCapability = () => {
    setCapabilitiesSheetMode({ pageId: "selection" });
  };

  const handleCloseSheet = useCallback(() => {
    setCapabilitiesSheetMode(null);
    setKnowledgeAction(null);
  }, []);

  const hasCapabilitiesConfigured =
    actionFields.length > 0 || skillFields.length > 0;

  return (
    <AgentBuilderSectionContainer
      title="Skills"
      description="Give your agent a custom capability for specific tasks"
      headerActions={
        hasCapabilitiesConfigured && (
          <ActionButtons
            onClickKnowledge={handleClickKnowledge}
            onClickCapability={handleClickCapability}
          />
        )
      }
    >
      <div className="flex-1">
        {isSkillsLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : hasCapabilitiesConfigured ? (
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
        ) : (
          <EmptyCTA
            action={
              <ActionButtons
                onClickKnowledge={handleClickKnowledge}
                onClickCapability={handleClickCapability}
              />
            }
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        )}
      </div>
      <KnowledgeConfigurationSheet
        onClose={handleCloseSheet}
        onSave={handleToolEditSave}
        action={knowledgeAction?.action ?? null}
        actions={actionFields}
        isEditing={Boolean(knowledgeAction && knowledgeAction.index !== null)}
        mcpServerViews={mcpServerViewsWithKnowledge}
        getAgentInstructions={() => getValues("instructions")}
        presetActionData={knowledgeAction?.presetData}
      />
      <CapabilitiesSheet
        mode={capabillitiesSheetMode}
        onClose={handleCloseSheet}
        onSave={handleSaveSkills}
        onModeChange={setCapabilitiesSheetMode}
        owner={owner}
        user={user}
        initialSelectedSkills={selectedSkills}
        initialAdditionalSpaces={additionalSpaces}
        alreadyRequestedSpaceIds={alreadyRequestedSpaceIds}
      />
    </AgentBuilderSectionContainer>
  );
}
