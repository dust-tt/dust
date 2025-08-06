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
import React, { useState } from "react";
import { useFieldArray } from "react-hook-form";

import type {
  AgentBuilderDataVizAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import type { DialogMode } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import { MCPServerViewsDialog } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { isDefaultActionName } from "@app/components/agent_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import {
  DATA_VISUALIZATION_SPECIFICATION,
  getActionSpecification,
  MCP_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types";

const dataVisualizationAction = {
  type: "DATA_VISUALIZATION",
  ...DATA_VISUALIZATION_SPECIFICATION,
};

const BACKGROUND_IMAGE_PATH = "/static/IconBar.svg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 20px",
  backgroundSize: "auto 60px",
  paddingTop: "100px",
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

interface MCPActionCardProps {
  action: AgentBuilderAction | AgentBuilderDataVizAction;
  onRemove: () => void;
  onEdit?: () => void;
}

// TODO: Merge this with ActionCard.
function MCPActionCard({ action, onRemove, onEdit }: MCPActionCardProps) {
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

interface ActionCardProps {
  action: AgentBuilderAction;
  onRemove: () => void;
  onEdit?: () => void;
}

function ActionCard({ action, onRemove, onEdit }: ActionCardProps) {
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

function shouldUseDialog(
  action: AgentBuilderAction,
  mcpServerViews: MCPServerViewType[]
): boolean {
  if (action.type !== "MCP") {
    return false;
  }

  return mcpServerViews.some(
    (view) => view.sId === action.configuration.mcpServerViewId
  );
}

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
  const mcpServerViews = [
    ...defaultMCPServerViews,
    ...nonDefaultMCPServerViews,
  ];

  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);

  const [isKnowledgeSheetOpen, setIsKnowledgeSheetOpen] = useState(false);
  const [knowledgeSheetAction, setKnowledgeSheetAction] = useState<{
    action: AgentBuilderAction;
    index: number;
  } | null>(null);
  const dataVisualization = fields.some(
    (field) => field.type === "DATA_VISUALIZATION"
  )
    ? null
    : dataVisualizationAction;

  const handleEditSave = (updatedAction: AgentBuilderAction) => {
    if (dialogMode?.type === "edit") {
      update(dialogMode.index, updatedAction);
    } else if (knowledgeSheetAction) {
      update(knowledgeSheetAction.index, updatedAction);
    } else {
      append(updatedAction);
    }
    setDialogMode(null);
    setKnowledgeSheetAction(null);
  };

  const handleActionEdit = (action: AgentBuilderAction, index: number) => {
    if (action.type === "MCP") {
      if (shouldUseDialog(action, mcpServerViews)) {
        setDialogMode(
          action.noConfigurationRequired
            ? { type: "info", action }
            : { type: "edit", action, index }
        );
      } else {
        setKnowledgeSheetAction({ action, index });
        setIsKnowledgeSheetOpen(true);
      }
    }
  };

  const handleCloseSheet = () => {
    setDialogMode(null);
    setIsKnowledgeSheetOpen(false);
    setKnowledgeSheetAction(null);
  };

  const handleMcpActionUpdate = (action: AgentBuilderAction, index: number) => {
    update(index, action);
  };

  const dropdownButtons = (
    <>
      <KnowledgeConfigurationSheet
        onClose={handleCloseSheet}
        onOpen={() => setIsKnowledgeSheetOpen(true)}
        onSave={handleEditSave}
        action={knowledgeSheetAction?.action}
        open={isKnowledgeSheetOpen}
      />
      <MCPServerViewsDialog
        addTools={append}
        dataVisualization={dataVisualization}
        mode={dialogMode}
        onModeChange={setDialogMode}
        onActionUpdate={handleMcpActionUpdate}
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
