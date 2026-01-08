import {
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Hoverable,
  Spinner,
  ToolsIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";
import { useController, useFieldArray, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { CapabilitiesSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesSheet";
import type { SelectedTool } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import { validateMCPActionConfiguration } from "@app/components/agent_builder/capabilities/mcp/utils/formValidation";
import { getSheetStateForActionEdit } from "@app/components/agent_builder/skills/sheetRouting";
import { useSkillsAndActionsState } from "@app/components/agent_builder/skills/skillsAndActionsState";
import type { SheetState } from "@app/components/agent_builder/skills/types";
import { isCapabilitiesSheetOpen } from "@app/components/agent_builder/skills/types";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { ResourceAvatar } from "@app/components/resources/resources_icons";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { ActionCard } from "@app/components/shared/tools_picker/ActionCard";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { BACKGROUND_IMAGE_STYLE_PROPS } from "@app/components/shared/tools_picker/util";
import { useSendNotification } from "@app/hooks/useNotification";
import { getSkillIcon } from "@app/lib/skill";
import { useSkillWithRelations } from "@app/lib/swr/skill_configurations";

interface SkillCardProps {
  skill: AgentBuilderSkillsType;
  onRemove: () => void;
  onClick: () => void;
}

function SkillCard({ skill, onRemove, onClick }: SkillCardProps) {
  const SkillIcon = getSkillIcon(skill.icon);

  return (
    <Card
      variant="primary"
      className="h-28"
      onClick={onClick}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            onRemove();
            e.stopPropagation();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <ResourceAvatar icon={SkillIcon} size="xs" />
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

export function AgentBuilderSkillsBlock() {
  const sendNotification = useSendNotification();
  const { owner } = useAgentBuilderContext();

  const { getValues } = useFormContext<AgentBuilderFormData>();
  const {
    fields: skillFields,
    remove: removeSkill,
    append: appendSkills,
  } = useFieldArray<AgentBuilderFormData, "skills">({
    name: "skills",
  });
  const {
    fields: actionFields,
    remove: removeAction,
    append: appendActions,
    update: updateAction,
  } = useFieldArray<AgentBuilderFormData, "actions">({
    name: "actions",
  });
  const { field: additionalSpacesField } = useController<
    AgentBuilderFormData,
    "additionalSpaces"
  >({
    name: "additionalSpaces",
  });

  const {
    mcpServerViewsWithKnowledge,
    mcpServerViewsWithoutKnowledge,
    mcpServerViews,
  } = useMCPServerViewsContext();
  const { skills: allSkills, isSkillsLoading } = useSkillsContext();
  const { spaces } = useSpacesContext();

  const { alreadyAddedSkillIds, alreadyRequestedSpaceIds } =
    useSkillsAndActionsState(
      skillFields,
      actionFields,
      mcpServerViews,
      allSkills,
      spaces
    );

  const [sheetState, setSheetState] = useState<SheetState>({ state: "closed" });

  // Sheets own closing after save; this handler only upserts into the form state.
  const handleToolEditSave = (updatedAction: BuilderAction) => {
    if (
      (sheetState.state === "configuration" ||
        sheetState.state === "knowledge") &&
      sheetState.index !== null
    ) {
      updateAction(sheetState.index, updatedAction);
      return;
    }

    appendActions(updatedAction);
  };

  const handleActionEdit = (action: BuilderAction, index: number) => {
    setSheetState(
      getSheetStateForActionEdit({
        action,
        index,
        mcpServerViewsWithKnowledge,
        mcpServerViewsWithoutKnowledge,
      })
    );
  };

  const { fetchSkillWithRelations } = useSkillWithRelations(owner, {
    onSuccess: ({ skill }) =>
      setSheetState({
        state: "info",
        kind: "skill",
        capability: skill,
        hasPreviousPage: false,
      }),
  });

  const handleCapabilitiesSave = useCallback(
    ({
      skills,
      additionalSpaces,
      tools,
    }: {
      skills: AgentBuilderSkillsType[];
      additionalSpaces: string[];
      tools: SelectedTool[];
    }) => {
      // Validate any configured tools before adding
      for (const tool of tools) {
        if (tool.configuredAction) {
          const validation = validateMCPActionConfiguration(
            tool.configuredAction,
            tool.view
          );

          if (!validation.isValid) {
            sendNotification({
              title: "Configuration validation failed",
              description: validation.errorMessage!,
              type: "error",
            });
            return;
          }
        }
      }
      const validatedActions = tools.map(
        (tool) => tool.configuredAction ?? getDefaultMCPAction(tool.view)
      );

      appendSkills(skills);
      additionalSpacesField.onChange(additionalSpaces);
      appendActions(validatedActions);
    },
    [appendSkills, additionalSpacesField, appendActions, sendNotification]
  );

  const handleClickKnowledge = () => {
    // We don't know which action will be selected so we will create a generic MCP action.
    const action = getDefaultMCPAction();

    setSheetState({
      state: "knowledge",
      action: {
        ...action,
        configurationRequired: true, // it's always required for knowledge
      },
      index: null,
    });
  };

  const handleClickCapability = () => {
    setSheetState({ state: "selection" });
  };

  const handleCloseSheet = useCallback(() => {
    setSheetState({ state: "closed" });
  }, []);

  const hasCapabilitiesConfigured =
    actionFields.length > 0 || skillFields.length > 0;

  return (
    <AgentBuilderSectionContainer
      title="Knowledge and capabilities"
      description={
        <>
          "Add knowledge, tools and skills to enhance your agent’s abilities.
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
          <CardGrid>
            {skillFields.map((field, index) => (
              <SkillCard
                key={field.id}
                skill={field}
                onRemove={() => removeSkill(index)}
                onClick={() => {
                  void fetchSkillWithRelations(field.sId);
                }}
              />
            ))}
            {actionFields.map((field, index) => (
              <ActionCard
                key={field.id}
                action={field}
                onRemove={() => removeAction(index)}
                onClick={() => handleActionEdit(field, index)}
              />
            ))}
          </CardGrid>
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
        action={sheetState.state === "knowledge" ? sheetState.action : null}
        actions={actionFields}
        isEditing={
          sheetState.state === "knowledge" && sheetState.index !== null
        }
        mcpServerViews={mcpServerViewsWithKnowledge}
        getAgentInstructions={() => getValues("instructions")}
        presetActionData={
          sheetState.state === "knowledge" ? sheetState.presetData : undefined
        }
      />
      <CapabilitiesSheet
        isOpen={isCapabilitiesSheetOpen(sheetState)}
        sheetState={
          isCapabilitiesSheetOpen(sheetState)
            ? sheetState
            : { state: "selection" }
        }
        onClose={handleCloseSheet}
        onCapabilitiesSave={handleCapabilitiesSave}
        onToolEditSave={handleToolEditSave}
        onStateChange={setSheetState}
        initialAdditionalSpaces={additionalSpacesField.value}
        alreadyRequestedSpaceIds={alreadyRequestedSpaceIds}
        alreadyAddedSkillIds={alreadyAddedSkillIds}
        selectedActions={actionFields}
        getAgentInstructions={() => getValues("instructions")}
      />
    </AgentBuilderSectionContainer>
  );
}
