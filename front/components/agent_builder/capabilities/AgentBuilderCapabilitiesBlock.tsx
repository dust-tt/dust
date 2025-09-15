import {
  Avatar,
  BoltIcon,
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  ContentMessage,
  EmptyCTA,
  Hoverable,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderDataVizAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { KnowledgeConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeConfigurationSheet";
import type { SheetMode } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { MCPServerViewsSheet } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { usePresetActionHandler } from "@app/components/agent_builder/capabilities/usePresetActionHandler";
import { getSpaceIdToActionsMap } from "@app/components/agent_builder/get_spaceid_to_actions_map";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
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
import type { TemplateActionPreset } from "@app/types";
import { asDisplayName, pluralize } from "@app/types";

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
}

export function AgentBuilderCapabilitiesBlock({
  isActionsLoading,
}: AgentBuilderCapabilitiesBlockProps) {
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

  const dataVisualization = fields.some(
    (field) => field.type === "DATA_VISUALIZATION"
  )
    ? null
    : dataVisualizationAction;

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
        action.noConfigurationRequired
          ? { type: "info", action, source: "addedTool" }
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
        icon={BoltIcon}
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
                  icon={BoltIcon}
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
        addTools={append}
        dataVisualization={dataVisualization}
        mode={dialogMode}
        onModeChange={setDialogMode}
        onActionUpdate={handleMcpActionUpdate}
        actions={fields}
        getAgentInstructions={getAgentInstructions}
      />
    </AgentBuilderSectionContainer>
  );
}
