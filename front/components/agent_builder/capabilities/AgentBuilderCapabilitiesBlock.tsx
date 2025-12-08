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
import { getSpaceIdToActionsMap } from "@app/components/agent_builder/get_spaceid_to_actions_map";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { ActionCard } from "@app/components/shared/tools_picker/ActionCard";
import { BACKGROUND_IMAGE_STYLE_PROPS } from "@app/components/shared/tools_picker/util";
import type { TemplateActionPreset } from "@app/types";
import { pluralize } from "@app/types";

interface AgentBuilderCapabilitiesBlockProps {
  isActionsLoading: boolean;
}

export function AgentBuilderCapabilitiesBlock({
  isActionsLoading,
}: AgentBuilderCapabilitiesBlockProps) {
  const { owner } = useAgentBuilderContext();
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { fields, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "actions"
  >({
    name: "actions",
  });

  const {
    mcpServerViewsWithKnowledge,
    mcpServerViews,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

  const { spaces } = useSpacesContext();

  const [dialogMode, setDialogMode] = useState<SheetMode | null>(null);
  const [knowledgeAction, setKnowledgeAction] = useState<{
    action: AgentBuilderAction;
    index: number | null;
    presetData?: TemplateActionPreset;
  } | null>(null);

  usePresetActionHandler({
    fields,
    append,
    setKnowledgeAction,
  });

  const handleEditSave = (updatedAction: AgentBuilderAction) => {
    if (dialogMode?.type === "edit") {
      update(dialogMode.index, updatedAction);
    } else if (knowledgeAction && knowledgeAction.index !== null) {
      update(knowledgeAction.index, updatedAction);
    } else {
      append(updatedAction);
    }
    setDialogMode(null);
    setKnowledgeAction(null);
  };

  const handleActionEdit = (action: AgentBuilderAction, index: number) => {
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

  const handleCloseSheet = () => {
    setDialogMode(null);
    setKnowledgeAction(null);
  };

  const handleMcpActionUpdate = (action: AgentBuilderAction, index: number) => {
    update(index, action);
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

  const headerActions = fields.length > 0 && (
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
        label="Add tools"
        icon={ToolsIcon}
        variant="outline"
      />
    </div>
  );

  return (
    <AgentBuilderSectionContainer
      title="Knowledge & Tools"
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
        ) : fields.length === 0 ? (
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
                  label="Add tools"
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
              {fields.map((field, index) => (
                <ActionCard
                  key={field.id}
                  action={field}
                  onRemove={() => remove(index)}
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
        actions={fields}
        isEditing={Boolean(knowledgeAction && knowledgeAction.index !== null)}
        mcpServerViews={mcpServerViewsWithKnowledge}
        getAgentInstructions={getAgentInstructions}
        presetActionData={knowledgeAction?.presetData}
      />
      <MCPServerViewsSheet
        owner={owner}
        addTools={append}
        mode={dialogMode}
        onModeChange={setDialogMode}
        onActionUpdate={handleMcpActionUpdate}
        selectedActions={fields}
        getAgentInstructions={getAgentInstructions}
      />
    </AgentBuilderSectionContainer>
  );
}
