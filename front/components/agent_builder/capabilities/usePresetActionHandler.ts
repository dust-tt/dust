import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { getDefaultMCPAction } from "@app/components/shared/tools_picker/formDefaults";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMCPServerNameForTemplateAction,
  getMcpServerViewDisplayName,
  isDirectAddTemplateAction,
  isKnowledgeTemplateAction,
} from "@app/lib/actions/mcp_helper";
import { allowsMultipleInstancesOfInternalMCPServerById } from "@app/lib/actions/mcp_internal_actions/constants";
import type { TemplateActionPreset } from "@app/types/assistant/templates";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import type { UseFieldArrayAppend } from "react-hook-form";

interface UsePresetActionHandlerProps {
  fields: AgentBuilderFormData["actions"];
  append: UseFieldArrayAppend<AgentBuilderFormData, "actions">;
  setKnowledgeAction: (
    action: {
      action: BuilderAction;
      index: number | null;
      presetData?: TemplateActionPreset;
    } | null
  ) => void;
}

export function usePresetActionHandler({
  fields,
  append,
  setKnowledgeAction,
}: UsePresetActionHandlerProps) {
  const { presetActionToAdd, setPresetActionToAdd } = useAgentBuilderContext();
  const {
    mcpServerViews,
    mcpServerViewsWithKnowledge,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();
  const sendNotification = useSendNotification();
  const { t } = useLingui();
  // Store preset object reference to prevent duplicate processing.
  const lastProcessedPresetRef = useRef<TemplateActionPreset | null>(null);

  useEffect(() => {
    if (!presetActionToAdd || isMCPServerViewsLoading) {
      if (!presetActionToAdd) {
        lastProcessedPresetRef.current = null;
      }
      return;
    }

    // Skip if same preset instance (handles rapid clicks and re-renders).
    if (lastProcessedPresetRef.current === presetActionToAdd) {
      return;
    }

    lastProcessedPresetRef.current = presetActionToAdd;

    const targetServerName =
      getMCPServerNameForTemplateAction(presetActionToAdd);
    const mcpServerViewSource = isKnowledgeTemplateAction(presetActionToAdd)
      ? mcpServerViewsWithKnowledge
      : mcpServerViews;

    const mcpServerView = mcpServerViewSource.find(
      (view) => view.server.name === targetServerName
    );

    if (!mcpServerView) {
      setPresetActionToAdd(null);
      return;
    }

    // Check for duplicates only for tools that don't allow multiple instances.
    if (isDirectAddTemplateAction(presetActionToAdd)) {
      const allowsMultiple = allowsMultipleInstancesOfInternalMCPServerById(
        mcpServerView.server.sId
      );

      if (!allowsMultiple) {
        const toolAlreadyAdded = fields.some(
          (field) => field.configuration?.mcpServerViewId === mcpServerView.sId
        );

        if (toolAlreadyAdded) {
          const toolName = getMcpServerViewDisplayName(mcpServerView);
          sendNotification({
            title: t`Tool already added`,
            description: t`${toolName} is already in your agent`,
            type: "info",
          });
          setPresetActionToAdd(null);
          return;
        }
      }
    }

    const action = getDefaultMCPAction(mcpServerView);
    action.name = presetActionToAdd.name;
    action.description = presetActionToAdd.description;

    if (isKnowledgeTemplateAction(presetActionToAdd)) {
      setKnowledgeAction({
        action: { ...action, configurationRequired: true },
        index: null,
        presetData: presetActionToAdd,
      });
    } else {
      append(action);

      const toolName = action.name;
      sendNotification({
        title: t`Tool added`,
        description: t`${toolName} has been added to your agent`,
        type: "success",
      });
    }

    setPresetActionToAdd(null);
  }, [
    presetActionToAdd,
    setPresetActionToAdd,
    mcpServerViews,
    mcpServerViewsWithKnowledge,
    isMCPServerViewsLoading,
    append,
    sendNotification,
    fields,
    setKnowledgeAction,
    t,
  ]);
}
