import {
  Avatar,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Page,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import React, { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderDataVizAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import type { DialogMode } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import { MCPServerViewsDialog } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  getDefaultMCPAction,
  isDefaultActionName,
} from "@app/components/agent_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import {
  DATA_VISUALIZATION_SPECIFICATION,
  MCP_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types";

const BACKGROUND_IMAGE_PATH = "/static/IconBar.svg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 20px",
  backgroundSize: "auto 60px",
  paddingTop: "100px",
} as const;

const CARD_HEIGHT = "h-32";

// Animation variants for smooth tool addition/removal
const TOOL_ANIMATION_VARIANTS = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0,
        staggerChildren: 0.03,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        staggerChildren: 0.02,
        staggerDirection: -1,
      },
    },
  },
  item: {
    hidden: {
      opacity: 0,
      scale: 0.95,
      y: 8,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 35,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -8,
      transition: {
        duration: 0.15,
        ease: "easeIn",
      },
    },
  },
  emptyState: {
    hidden: { opacity: 0, scale: 0.98 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 35,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.98,
      transition: { duration: 0.15 },
    },
  },
  cardGrid: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.2,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.15 },
    },
  },
} as const;

const dataVisualizationAction = {
  type: "DATA_VISUALIZATION",
  ...DATA_VISUALIZATION_SPECIFICATION,
};

function getActionIcon(
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

  return null;
}

function getActionDisplayName(
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

  return (
    <Card
      variant="primary"
      className={CARD_HEIGHT}
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
          {getActionIcon(action, mcpServerView)}
          <div className="w-full truncate">
            {getActionDisplayName(action, mcpServerView)}
          </div>
        </div>
        <div className="line-clamp-4 text-muted-foreground dark:text-muted-foreground-night">
          <p>{action.description}</p>
        </div>
      </div>
    </Card>
  );
}

export function AgentBuilderCapabilitiesBlock() {
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { fields, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "actions"
  >({
    name: "actions",
  });

  const { mcpServerViewsWithKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);

  const [knowledgeAction, setKnowledgeAction] = useState<{
    action: AgentBuilderAction;
    index: number | null;
  } | null>(null);
  const dataVisualization = fields.some(
    (field) => field.type === "DATA_VISUALIZATION"
  )
    ? null
    : dataVisualizationAction;

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
        action.configuration.dataSourceConfigurations ||
          action.configuration.tablesConfigurations
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

  const dropdownButtons = (
    <>
      <KnowledgeConfigurationSheet
        onClose={handleCloseSheet}
        onClickKnowledge={onClickKnowledge}
        onSave={handleEditSave}
        action={knowledgeAction?.action ?? null}
        isEditing={Boolean(knowledgeAction && knowledgeAction.index !== null)}
        mcpServerViews={mcpServerViewsWithKnowledge}
        getAgentInstructions={getAgentInstructions}
      />
      <MCPServerViewsDialog
        addTools={append}
        dataVisualization={dataVisualization}
        mode={dialogMode}
        onModeChange={setDialogMode}
        onActionUpdate={handleMcpActionUpdate}
        getAgentInstructions={getAgentInstructions}
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
        ) : (
          <div className="min-h-[200px]">
            <LayoutGroup>
              <AnimatePresence mode="wait">
                {fields.length === 0 ? (
                  <motion.div
                    key="empty-state"
                    variants={TOOL_ANIMATION_VARIANTS.emptyState}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    className="h-full"
                  >
                    <EmptyCTA
                      action={
                        <div className="flex items-center gap-2">
                          {dropdownButtons}
                        </div>
                      }
                      style={BACKGROUND_IMAGE_STYLE_PROPS}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="card-grid"
                    variants={TOOL_ANIMATION_VARIANTS.cardGrid}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    className="h-full"
                  >
                    <motion.div
                      variants={TOOL_ANIMATION_VARIANTS.container}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <CardGrid>
                        {fields.map((field, index) => (
                          <motion.div
                            key={field.id}
                            variants={TOOL_ANIMATION_VARIANTS.item}
                            layout
                            layoutId={field.id}
                          >
                            <ActionCard
                              action={field}
                              onRemove={() => remove(index)}
                              onEdit={() => handleActionEdit(field, index)}
                            />
                          </motion.div>
                        ))}
                      </CardGrid>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </LayoutGroup>
          </div>
        )}
      </div>
    </div>
  );
}
