import {
  Avatar,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";
import type { FieldArrayWithId } from "react-hook-form";
import { useFieldArray } from "react-hook-form";

import type {
  AgentBuilderDataVizAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AddKnowledgeDropdown } from "@app/components/agent_builder/capabilities/AddKnowledgeDropdown";
import { AddToolsDropdown } from "@app/components/agent_builder/capabilities/AddToolsDropdown";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type {
  AgentBuilderAction,
  KnowledgeServerName,
} from "@app/components/agent_builder/types";
import {
  isDefaultActionName,
  isKnowledgeServerName,
} from "@app/components/agent_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import {
  DATA_VISUALIZATION_SPECIFICATION,
  getActionSpecification,
  MCP_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import logger from "@app/logger/logger";
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
function MCPActionCard({
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

  const spec =
    action.type === "DATA_VISUALIZATION"
      ? DATA_VISUALIZATION_SPECIFICATION
      : MCP_SPECIFICATION;

  if (!spec) {
    // Unreachable
    return null;
  }

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

export function AgentBuilderCapabilitiesBlock() {
  const { fields, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "actions"
  >({
    name: "actions",
  });

  const {
    mcpServerViewsWithKnowledge,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();
  const [editingAction, setEditingAction] = useState<{
    action: AgentBuilderAction;
    index: number;
  } | null>(null);

  const [openSheet, setOpenSheet] = useState<KnowledgeServerName | null>(null);

  // TODO: Open single sheet for selected MCP action.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedAction, setSelectedAction] =
    useState<AgentBuilderAction | null>(null);

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
    setEditingAction({ action, index });

    switch (action.type) {
      case "SEARCH":
        setOpenSheet("search");
        break;
      case "INCLUDE_DATA":
        setOpenSheet("include_data");
        break;
      case "EXTRACT_DATA":
        setOpenSheet("extract_data");
        break;
    }
  };

  const handleCloseSheet = () => {
    setOpenSheet(null);
    setEditingAction(null);
  };

  const handleKnowledgeAdd = (serverName: string) => {
    setEditingAction(null);
    if (isKnowledgeServerName(serverName)) {
      setOpenSheet(serverName);
    } else {
      logger.warn({ serverName }, "Unknown knowledge server");
    }
  };

  const dropdownButtons = (
    <>
      <AddKnowledgeDropdown
        mcpServerViewsWithKnowledge={mcpServerViewsWithKnowledge}
        onItemClick={handleKnowledgeAdd}
        isMCPServerViewsLoading={isMCPServerViewsLoading}
      />
      <AddToolsDropdown
        tools={fields}
        addTools={append}
        defaultMCPServerViews={selectableDefaultMCPServerViews}
        nonDefaultMCPServerViews={selectableNonDefaultMCPServerViews}
        dataVisualization={dataVisualization}
        isMCPServerViewsLoading={isMCPServerViewsLoading}
        setSelectedAction={setSelectedAction}
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
        {fields.length === 0 ? (
          <EmptyCTA
            message="No tools added yet. Add knowledge and tools to enhance your agent's capabilities."
            action={
              <div className="flex items-center gap-2">{dropdownButtons}</div>
            }
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

      <KnowledgeConfigurationSheet
        capability={openSheet}
        isOpen={openSheet !== null}
        onClose={handleCloseSheet}
        onSave={handleEditSave}
        action={editingAction?.action}
      />
    </div>
  );
}
