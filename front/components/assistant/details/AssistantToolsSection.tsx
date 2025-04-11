import {
  Avatar,
  BarChartIcon,
  ChatBubbleThoughtIcon,
  CommandIcon,
  GlobeAltIcon,
  ScanIcon,
} from "@dust-tt/sparkle";
import _ from "lodash";
import React from "react";

import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { getVisual } from "@app/lib/actions/mcp_icons";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isMCPServerConfiguration,
  isPlatformMCPServerConfiguration,
  isProcessConfiguration,
  isReasoningConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
} from "@app/lib/actions/types/guards";
import type { MCPServerTypeWithViews } from "@app/lib/api/mcp";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import type { AgentConfigurationType, LightWorkspaceType } from "@app/types";
import { assertNever, removeNulls, SUPPORTED_MODEL_CONFIGS } from "@app/types";

interface AssistantToolsSectionProps {
  agentConfiguration: AgentConfigurationType;
  owner: LightWorkspaceType;
}

export function AssistantToolsSection({
  agentConfiguration,
  owner,
}: AssistantToolsSectionProps) {
  const { isDark } = useTheme();
  const { mcpServers } = useMCPServers({ owner });

  const actions = removeNulls(
    agentConfiguration.actions.map((action) =>
      renderOtherAction(action, mcpServers)
    )
  );
  if (agentConfiguration.visualizationEnabled) {
    actions.push({
      title: "Visualize",
      visual: <BarChartIcon />,
      order: 0,
    });
  }
  const sortedActions = _.uniqBy(_.sortBy(actions, "order", "title"), "title");

  const models = [
    SUPPORTED_MODEL_CONFIGS.find(
      (m) =>
        m.modelId === agentConfiguration.model.modelId &&
        m.providerId === agentConfiguration.model.providerId
    ),
  ];
  const reasoningAction = agentConfiguration.actions.find(
    isReasoningConfiguration
  );
  if (reasoningAction) {
    models.push(
      SUPPORTED_MODEL_CONFIGS.find(
        (m) =>
          m.modelId === reasoningAction.modelId &&
          m.providerId === reasoningAction.providerId
      )
    );
  }

  const filteredModels = removeNulls(models);
  return (
    <div className="flex flex-row gap-2">
      {sortedActions.length > 0 && (
        <div className="flex flex-[1_0_0] flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Tools
          </div>
          <div className="flex flex-col gap-2">
            {sortedActions.map((action) => (
              <div
                className="flex flex-row items-center gap-2"
                key={action.title}
              >
                <Avatar visual={action.visual} size="xs" />
                <div>{action.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {filteredModels.length > 0 && (
        <div className="flex flex-[1_0_0] flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Models
          </div>
          <div className="flex flex-col gap-2">
            {filteredModels.map((model) => (
              <div
                className="flex flex-row items-center gap-2"
                key={model.modelId}
              >
                <Avatar
                  visual={React.createElement(
                    getModelProviderLogo(model.providerId, isDark)
                  )}
                  size="xs"
                />
                <div>{model.displayName}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function renderOtherAction(
  action: AgentActionConfigurationType,
  mcpServers: MCPServerTypeWithViews[]
) {
  if (isDustAppRunConfiguration(action)) {
    return { title: action.name, visual: <CommandIcon />, order: 2 };
  } else if (isProcessConfiguration(action)) {
    return {
      title: "Extract from documents",
      visual: <ScanIcon />,
      order: 0,
    };
  } else if (isWebsearchConfiguration(action)) {
    return {
      title: "Web Search & Navigation",
      visual: <GlobeAltIcon />,
      order: 0,
    };
  } else if (isReasoningConfiguration(action)) {
    return { title: "Reasoning", visual: <ChatBubbleThoughtIcon />, order: 0 };
  } else if (isPlatformMCPServerConfiguration(action)) {
    const mcpServer = mcpServers.find((s) =>
      s.views.some((v) => v.id === action.mcpServerViewId)
    );
    if (!mcpServer) {
      return null;
    }
    const { serverType } = getServerTypeAndIdFromSId(mcpServer.id);
    const visual = getVisual(mcpServer);
    return {
      title: action.name,
      visual,
      order: serverType === "internal" ? 1 : 3,
    };
  } else if (isMCPServerConfiguration(action)) {
    return { title: action.name, visual: <CommandIcon />, order: 3 };
  } else if (isBrowseConfiguration(action)) {
    return null;
  } else if (isRetrievalConfiguration(action)) {
    return null;
  } else if (isTablesQueryConfiguration(action)) {
    return null;
  } else {
    return assertNever(action);
  }
}
