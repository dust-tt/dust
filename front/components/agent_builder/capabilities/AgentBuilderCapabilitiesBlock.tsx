import {
  Avatar,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";
import type { FieldArrayWithId } from "react-hook-form";
import { useFieldArray } from "react-hook-form";

import type {
  AgentBuilderDataVizAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import { MCPServerViewsDialog } from "@app/components/agent_builder/capabilities/MCPServerViewsDialog";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  isDefaultActionName,
  isSupportedAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import {
  DATA_VISUALIZATION_SPECIFICATION,
  getActionSpecification,
  MCP_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types";

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

// TODO: Merge this with ActionCard.
export function MCPActionCard({
  action,
  onRemove,
  onEdit,
}: {
  action: AgentBuilderAction | AgentBuilderDataVizAction;
  onRemove: () => void;
  onEdit?: () => void;
}) {
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const mcpServerView =
    action.type === "MCP" && !isMCPServerViewsLoading
      ? mcpServerViews.find(
          (mcpServerView) =>
            mcpServerView.sId === action.configuration.mcpServerViewId
        ) ?? null
      : null;

  return (
    <Card
      variant="primary"
      className="max-h-40"
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
          <div className="w-full truncate">
            {actionDisplayName(action, mcpServerView)}
          </div>
        </div>
        <div className="line-clamp-4 text-muted-foreground dark:text-muted-foreground-night">
          <p>{action.description}</p>
        </div>
      </div>
    </Card>
  );
}

function ActionCard({
  action,
  onRemove,
  onEdit,
}: {
  action: AgentBuilderAction;
  onRemove: () => void;
  onEdit?: () => void;
}) {
  const spec = getActionSpecification(action.type);

  if (!spec) {
    return null;
  }

  return (
    <Card
      variant="primary"
      className="max-h-40"
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
          <Avatar icon={spec.cardIcon} size="xs" />
          <div className="w-full truncate">{action.name}</div>
        </div>
        <div className="line-clamp-4 text-muted-foreground dark:text-muted-foreground-night">
          <p>{action.description}</p>
        </div>
      </div>
    </Card>
  );
}

const dataVisualizationAction = {
  type: "DATA_VISUALIZATION",
  ...DATA_VISUALIZATION_SPECIFICATION,
};

function filterSelectableViews(
  views: MCPServerViewTypeWithLabel[],
  fields: FieldArrayWithId<AgentBuilderFormData, "actions", "id">[]
) {
  return views.filter((view) => {
    const selectedAction = fields.find(
      (field) => field.name === view.server.name
    );

    if (selectedAction) {
      return !selectedAction.noConfigurationRequired;
    }

    return true;
  });
}

const BACKGROUND_IMAGE_PATH = "/static/IconBar.svg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 20px",
  backgroundSize: "auto 60px",
  paddingTop: "100px",
};

export function AgentBuilderCapabilitiesBlock() {
  const { fields, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "actions"
  >({
    name: "actions",
  });

  const {
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();
  const [editingAction, setEditingAction] = useState<{
    action: AgentBuilderAction;
    index: number;
  } | null>(null);

  // State for info mode (non-configurable tools)
  const [infoAction, setInfoAction] = useState<AgentBuilderAction | null>(null);

  const [isKnowledgeSheetOpen, setIsKnowledgeSheetOpen] = useState(false);

  // TODO: Add logic for reasoning.
  const selectableDefaultMCPServerViews = useMemo(
    () => filterSelectableViews(defaultMCPServerViews, fields),
    [defaultMCPServerViews, fields]
  );

  const selectableNonDefaultMCPServerViews = useMemo(
    () => filterSelectableViews(nonDefaultMCPServerViews, fields),
    [nonDefaultMCPServerViews, fields]
  );

  const dataVisualization = fields.some(
    (field) => field.type === "DATA_VISUALIZATION"
  )
    ? null
    : dataVisualizationAction;

  const handleEditSave = (updatedAction: AgentBuilderAction) => {
    if (editingAction) {
      update(editingAction.index, updatedAction);
    } else {
      append(updatedAction);
    }
    setEditingAction(null);
  };

  const handleActionEdit = (action: AgentBuilderAction, index: number) => {
    if (action.type === "MCP") {
      // For MCP actions, check if they are configurable
      if (action.noConfigurationRequired) {
        // Non-configurable tool - show info dialog
        setInfoAction(action);
      } else {
        // Configurable tool - show edit dialog
        setEditingAction({ action, index });
      }
    } else {
      // For other action types, use normal edit flow
      setEditingAction({ action, index });
      if (isSupportedAgentBuilderAction(action)) {
        setIsKnowledgeSheetOpen(true);
      }
    }
  };

  const handleCloseSheet = () => {
    setEditingAction(null);
    setIsKnowledgeSheetOpen(false);
  };

  const handleMcpEditSave = (action: AgentBuilderAction, index: number) => {
    update(index, action);
    setEditingAction(null);
  };

  const handleMcpEditCancel = () => {
    setEditingAction(null);
  };

  const handleInfoActionClose = () => {
    setInfoAction(null);
  };

  const dropdownButtons = (
    <>
      <KnowledgeConfigurationSheet
        onClose={handleCloseSheet}
        onOpen={() => setIsKnowledgeSheetOpen(true)}
        onSave={handleEditSave}
        action={editingAction?.action}
        open={isKnowledgeSheetOpen}
      />
      <MCPServerViewsDialog
        addTools={append}
        mcpServerViews={[
          ...selectableDefaultMCPServerViews,
          ...selectableNonDefaultMCPServerViews,
        ]}
        dataVisualization={dataVisualization}
        isMCPServerViewsLoading={isMCPServerViewsLoading}
        editAction={
          editingAction?.action.type === "MCP" ? editingAction.action : null
        }
        editActionIndex={
          editingAction?.action.type === "MCP" ? editingAction.index : undefined
        }
        onEditActionSave={handleMcpEditSave}
        onEditActionCancel={handleMcpEditCancel}
        infoAction={infoAction}
        onInfoActionClose={handleInfoActionClose}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <Page.H>Tools & Capabilities</Page.H>
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <Page.P>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Add tools and capabilities to enhance your agent's abilities.
          </span>
        </Page.P>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            {fields.length > 0 && dropdownButtons}
          </div>
        </div>
      </div>
      <div className="flex-1">
        {isMCPServerViewsLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : fields.length === 0 ? (
          <EmptyCTA
            action={
              <div className="flex items-center gap-2">{dropdownButtons}</div>
            }
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
          <CardGrid>
            {fields.map((field, index) =>
              field.type === "MCP" ? (
                <MCPActionCard
                  key={field.id}
                  action={field}
                  onRemove={() => remove(index)}
                  onEdit={() => handleActionEdit(field, index)}
                />
              ) : (
                <ActionCard
                  key={field.id}
                  action={field}
                  onRemove={() => remove(index)}
                  onEdit={() => handleActionEdit(field, index)}
                />
              )
            )}
          </CardGrid>
        )}
      </div>
    </div>
  );
}
