import {
  BookOpenIcon,
  Button,
  CardGrid,
  ContentMessage,
  EmptyCTA,
  Hoverable,
  Spinner,
  ToolsIcon,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import type { SheetMode } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { MCPServerViewsSheet } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { usePresetActionHandler } from "@app/components/agent_builder/capabilities/usePresetActionHandler";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { ActionCard } from "@app/components/shared/tools_picker/ActionCard";
import { AddedSkillCard } from "@app/components/shared/tools_picker/AddedSkillCard";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { BACKGROUND_IMAGE_STYLE_PROPS } from "@app/components/shared/tools_picker/util";
import { useSkillConfigurationsWithRelations } from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { TemplateActionPreset } from "@app/types";
import { pluralize } from "@app/types";

interface AgentBuilderCapabilitiesBlockProps {
  isActionsLoading: boolean;
}

export function AgentBuilderCapabilitiesBlock({
  isActionsLoading,
}: AgentBuilderCapabilitiesBlockProps) {
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const {
    fields: actionFields,
    remove: removeActions,
    append: appendActions,
    update: updateActions,
  } = useFieldArray<AgentBuilderFormData, "actions">({
    name: "actions",
  });

  const {
    mcpServerViewsWithKnowledge,
    mcpServerViews,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

  const { spaces } = useSpacesContext();
  const { owner } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const showSkills = hasFeature("skills");

  const {
    skillConfigurationsWithRelations: skills,
    isSkillConfigurationsWithRelationsLoading: isSkillsLoading,
  } = useSkillConfigurationsWithRelations({
    owner,
    status: "active",
    disabled: !showSkills,
  });

  const {
    fields: skillFields,
    append: appendSkills,
    remove: removeSkills,
  } = useFieldArray<AgentBuilderFormData, "skills">({
    name: "skills",
  });

  const [dialogMode, setDialogMode] = useState<SheetMode | null>(null);
  const [knowledgeAction, setKnowledgeAction] = useState<{
    action: BuilderAction;
    index: number | null;
    presetData?: TemplateActionPreset;
  } | null>(null);

  usePresetActionHandler({
    fields: actionFields,
    append: appendActions,
    setKnowledgeAction,
  });

  const handleEditSave = (updatedAction: BuilderAction) => {
    if (dialogMode?.type === "edit") {
      updateActions(dialogMode.index, updatedAction);
    } else if (knowledgeAction && knowledgeAction.index !== null) {
      updateActions(knowledgeAction.index, updatedAction);
    } else {
      appendActions(updatedAction);
    }
    setDialogMode(null);
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
      setDialogMode(
        action.configurationRequired
          ? { type: "edit", action, index }
          : { type: "info", action, source: "addedTool" }
      );
    }
  };

  const handleSkillClick = (skillSId: string) => {
    const skill = skills.find((s) => s.sId === skillSId);
    if (skill) {
      setDialogMode({ type: "skill-info", skill, source: "addedSkill" });
    }
  };

  const handleCloseSheet = () => {
    setDialogMode(null);
    setKnowledgeAction(null);
  };

  const handleMcpActionUpdate = (action: BuilderAction, index: number) => {
    updateActions(index, action);
  };

  const onClickKnowledge = () => {
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
  const actions = getValues("actions");
  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    return nonGlobalSpaces.filter((s) => spaceIdToActions[s.sId]?.length > 0);
  }, [spaceIdToActions, spaces]);

  const getAgentInstructions = () => getValues("instructions");

  const toolsButtonLabel = showSkills ? "Add capabilities" : "Add tools";
  const sectionTitle = showSkills
    ? "Knowledge, Tools & Skills"
    : "Knowledge & Tools";
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
        onClick={() => setDialogMode({ type: "add" })}
        label={toolsButtonLabel}
        icon={ToolsIcon}
        variant="outline"
      />
    </div>
  );

  return (
    <AgentBuilderSectionContainer
      title={sectionTitle}
      description={
        <>
          Add knowledge and tools to enhance your agent’s abilities. Need help?
          Check our{" "}
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
        {isMCPServerViewsLoading || isActionsLoading ? (
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
                  onClick={() => setDialogMode({ type: "add" })}
                  label={toolsButtonLabel}
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
            {!hasFeature("skills") &&
              nonGlobalSpacesUsedInActions.length > 0 && (
                <div className="mb-4 w-full">
                  <ContentMessage variant="golden" size="lg">
                    Based on your selection, this agent can only be used by
                    users with access to space
                    {pluralize(nonGlobalSpacesUsedInActions.length)} :{" "}
                    <strong>
                      {nonGlobalSpacesUsedInActions
                        .map((v) => v.name)
                        .join(", ")}
                    </strong>
                    .
                  </ContentMessage>
                </div>
              )}
            <CardGrid>
              {
                // TODO(skills 2025-12-17): display skills and actions in the order they were added, not separated by type
              }
              {skillFields.map((field, index) => (
                <AddedSkillCard
                  key={field.id}
                  skill={field}
                  onRemove={() => removeSkills(index)}
                  onClick={() => handleSkillClick(field.sId)}
                />
              ))}
              {actionFields.map((field, index) => (
                <ActionCard
                  key={field.id}
                  action={field}
                  onRemove={() => removeActions(index)}
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
      <MCPServerViewsSheet
        addTools={appendActions}
        mode={dialogMode}
        onModeChange={setDialogMode}
        onActionUpdate={handleMcpActionUpdate}
        selectedActions={actionFields}
        getAgentInstructions={getAgentInstructions}
        skills={skills}
        isSkillsLoading={isSkillsLoading}
        onAddSkills={appendSkills}
        selectedSkills={skillFields}
      />
    </AgentBuilderSectionContainer>
  );
}
