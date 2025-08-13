import {
  Avatar,
  BoltIcon,
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Hoverable,
  ListAddIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { isEmpty } from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderDataVizAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import type { DialogMode } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import { MCPServerViewsDialog } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  getDefaultMCPAction,
  isDefaultActionName,
} from "@app/components/agent_builder/types";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerViewDisplayName,
  getMCPServerNameForTemplateAction,
  isDirectAddTemplateAction,
  isKnowledgeTemplateAction,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { allowsMultipleInstancesOfInternalMCPServerById } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  DATA_VISUALIZATION_SPECIFICATION,
  MCP_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types";
import type { TemplateActionPreset } from "@app/types";

const dataVisualizationAction = {
  type: "DATA_VISUALIZATION",
  ...DATA_VISUALIZATION_SPECIFICATION,
};

const BACKGROUND_IMAGE_PATH = "/static/IconBar.svg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 14px",
  backgroundSize: "auto 60px",
  paddingTop: "90px",
};

function actionIcon(
  action: AgentBuilderAction | AgentBuilderDataVizAction,
  mcpServerView: MCPServerViewType | null
) {
  if (mcpServerView?.server) {
    return getAvatar(mcpServerView.server, "xs");
  }

  if (action.type === "DATA_VISUALIZATION") {
    return (
      <Avatar icon={DATA_VISUALIZATION_SPECIFICATION.cardIcon} size="xs" />
    );
  }
}

function actionDisplayName(
  action: AgentBuilderAction | AgentBuilderDataVizAction,
  mcpServerView: MCPServerViewType | null
) {
  if (mcpServerView && action.type === "MCP") {
    return getMcpServerViewDisplayName(mcpServerView, action);
  }

  if (action.type === "DATA_VISUALIZATION") {
    return asDisplayName(action.name);
  }

  return `${MCP_SPECIFICATION.label}${
    !isDefaultActionName(action) ? " - " + action.name : ""
  }`;
}

interface ActionCardProps {
  action: AgentBuilderAction | AgentBuilderDataVizAction;
  onRemove: () => void;
  onEdit?: () => void;
}

function ActionCard({ action, onRemove, onEdit }: ActionCardProps) {
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const mcpServerView =
    action.type === "MCP" && !isMCPServerViewsLoading
      ? mcpServerViews.find(
          (mcpServerView) =>
            mcpServerView.sId === action.configuration.mcpServerViewId
        ) ?? null
      : null;

  const displayName = actionDisplayName(action, mcpServerView);
  const description = action.description ?? "";

  return (
    <Card
      variant="primary"
      className="h-28"
      onClick={onEdit}
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
          {actionIcon(action, mcpServerView)}
          <span className="truncate">{displayName}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{description}</span>
        </div>
      </div>
    </Card>
  );
}
interface AgentBuilderCapabilitiesBlockProps {
  isActionsLoading: boolean;
  presetActionToAdd?: TemplateActionPreset | null;
  onPresetActionHandled?: () => void;
}

export function AgentBuilderCapabilitiesBlock({
  isActionsLoading,
  presetActionToAdd,
  onPresetActionHandled,
}: AgentBuilderCapabilitiesBlockProps) {
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { fields, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "actions"
  >({
    name: "actions",
  });

  const { mcpServerViewsWithKnowledge, mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const sendNotification = useSendNotification();

  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [knowledgeAction, setKnowledgeAction] = useState<{
    action: AgentBuilderAction;
    index: number | null;
    presetData?: TemplateActionPreset | null;
  } | null>(null);
  
  // Use a ref to track if we're processing to prevent multiple executions
  const processingRef = useRef(false);
  
  const dataVisualization = fields.some(
    (field) => field.type === "DATA_VISUALIZATION"
  )
    ? null
    : dataVisualizationAction;

  // Handle preset actions from templates
  // useEffect is appropriate here for cross-panel communication:
  // 1. Template panel (right) triggers action addition
  // 2. Capabilities block (left) responds by opening dialogs or adding tools
  // 3. Parent component coordinates via props and callbacks
  useEffect(() => {
    if (!presetActionToAdd || isMCPServerViewsLoading) return;
    
    // Prevent multiple executions for the same preset action
    if (processingRef.current) {
      return;
    }
    
    processingRef.current = true;

    // Get the MCP server name for this template action
    const targetServerName = getMCPServerNameForTemplateAction(presetActionToAdd);
    const mcpServerViewSource = isKnowledgeTemplateAction(presetActionToAdd) 
      ? mcpServerViewsWithKnowledge 
      : mcpServerViews;
    
    const mcpServerView = mcpServerViewSource.find(
      (view) => view.server.name === targetServerName
    );
    
    if (!mcpServerView) {
      processingRef.current = false;
      onPresetActionHandled?.();
      return;
    }

    // Check for duplicates only for tools that don't allow multiple instances
    // Note: All knowledge actions (search, query_tables, extract_data) allow multiple instances
    if (isDirectAddTemplateAction(presetActionToAdd)) {
      const allowsMultiple = allowsMultipleInstancesOfInternalMCPServerById(mcpServerView.server.sId);
      
      if (!allowsMultiple) {
        const toolAlreadyAdded = fields.some(
          field => field.type === "MCP" && 
          field.configuration?.mcpServerViewId === mcpServerView.sId
        );
        
        if (toolAlreadyAdded) {
          sendNotification({
            title: "Tool already added",
            description: `${getMcpServerViewDisplayName(mcpServerView)} is already in your agent`,
            type: "info",
          });
          processingRef.current = false;
          onPresetActionHandled?.();
          return;
        }
      }
    }

    // Create action with preset data
    const action = getDefaultMCPAction(mcpServerView);
    action.name = presetActionToAdd.name;
    action.description = presetActionToAdd.description;
    
    if (isKnowledgeTemplateAction(presetActionToAdd)) {
      // Open knowledge configuration dialog
      setKnowledgeAction({
        action: { ...action, noConfigurationRequired: false },
        index: null,
        presetData: presetActionToAdd,
      });
    } else {
      // Add tool directly
      append(action);
      
      sendNotification({
        title: "Tool added",
        description: `${action.name} has been added to your agent`,
        type: "success",
      });
    }

    // Clear the preset action after handling
    onPresetActionHandled?.();
    
    // Reset the processing flag after a short delay to allow for state updates
    setTimeout(() => {
      processingRef.current = false;
    }, 100);
  }, [presetActionToAdd, onPresetActionHandled, mcpServerViews, mcpServerViewsWithKnowledge, isMCPServerViewsLoading, append, sendNotification, fields]);

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
    const isDataSourceSelectionRequired =
      action.type === "MCP" &&
      Boolean(
        !isEmpty(action.configuration.dataSourceConfigurations) ||
          !isEmpty(action.configuration.tablesConfigurations)
      );

    if (isDataSourceSelectionRequired) {
      setKnowledgeAction({ action, index });
    } else {
      setDialogMode(
        action.noConfigurationRequired
          ? { type: "info", action }
          : { type: "edit", action, index }
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
        noConfigurationRequired: false, // it's always required for knowledge
      },
      index: null,
    });
  };

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
        icon={ListAddIcon}
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
                  icon={BoltIcon}
                  variant="primary"
                />
                <Button
                  type="button"
                  onClick={() => setDialogMode({ type: "add" })}
                  label="Add tools"
                  icon={ListAddIcon}
                  variant="outline"
                />
              </div>
            }
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
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
      <MCPServerViewsDialog
        addTools={append}
        dataVisualization={dataVisualization}
        mode={dialogMode}
        onModeChange={setDialogMode}
        onActionUpdate={handleMcpActionUpdate}
        actions={fields}
        getAgentInstructions={getAgentInstructions}
        presetActionData={presetActionToAdd}
      />
    </AgentBuilderSectionContainer>
  );
}
