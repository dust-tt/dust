import type { NotificationType } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";
import type { UseFieldArrayAppend } from "react-hook-form";

import type {
  AgentBuilderAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import {
  getMcpServerViewDisplayName,
  getMCPServerNameForTemplateAction,
  isDirectAddTemplateAction,
  isKnowledgeTemplateAction,
} from "@app/lib/actions/mcp_helper";
import { allowsMultipleInstancesOfInternalMCPServerById } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { TemplateActionPreset } from "@app/types";

interface UsePresetActionHandlerProps {
  presetActionToAdd?: TemplateActionPreset;
  onPresetActionHandled?: () => void;
  mcpServerViews: MCPServerViewType[];
  mcpServerViewsWithKnowledge: MCPServerViewType[];
  isMCPServerViewsLoading: boolean;
  append: UseFieldArrayAppend<AgentBuilderFormData, "actions">;
  sendNotification: (notification: NotificationType) => void;
  fields: AgentBuilderFormData["actions"];
  setKnowledgeAction: (action: {
    action: AgentBuilderAction;
    index: number | null;
    presetData?: TemplateActionPreset;
  } | null) => void;
}

export function usePresetActionHandler({
  presetActionToAdd,
  onPresetActionHandled,
  mcpServerViews,
  mcpServerViewsWithKnowledge,
  isMCPServerViewsLoading,
  append,
  sendNotification,
  fields,
  setKnowledgeAction,
}: UsePresetActionHandlerProps) {
  // Use a ref to track if we're processing to prevent multiple executions
  const processingRef = useRef(false);

  useEffect(() => {
    if (!presetActionToAdd || isMCPServerViewsLoading) return;

    // Prevent duplicate processing
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;

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
    if (isDirectAddTemplateAction(presetActionToAdd)) {
      const allowsMultiple = allowsMultipleInstancesOfInternalMCPServerById(
        mcpServerView.server.sId
      );

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

    // Open knowledge configuration dialog or add tool directly
    if (isKnowledgeTemplateAction(presetActionToAdd)) {
      setKnowledgeAction({
        action: { ...action, noConfigurationRequired: false },
        index: null,
        presetData: presetActionToAdd,
      });
    } else {
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
  }, [
    presetActionToAdd,
    onPresetActionHandled,
    mcpServerViews,
    mcpServerViewsWithKnowledge,
    isMCPServerViewsLoading,
    append,
    sendNotification,
    fields,
    setKnowledgeAction,
  ]);
}