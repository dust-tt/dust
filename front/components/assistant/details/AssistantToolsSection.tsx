import { Avatar, BarChartIcon, CommandIcon } from "@dust-tt/sparkle";
import _ from "lodash";

import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  getMcpServerDisplayName,
  getServerTypeAndIdFromSId,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isMCPServerConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import type { MCPServerTypeWithViews } from "@app/lib/api/mcp";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import type { AgentConfigurationType, LightWorkspaceType } from "@app/types";
import {
  assertNever,
  GLOBAL_AGENTS_SID,
  removeNulls,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

interface AssistantToolsSectionProps {
  agentConfiguration: AgentConfigurationType;
  owner: LightWorkspaceType;
}

// Since Dust is configured with one search for all, plus individual searches for each managed data source,
// we hide these additional searches from the user in the UI to avoid displaying the same data source twice.
// We use the `hidden_dust_search_` prefix to identify these additional searches.
const isHiddenDustAction = (
  agentConfiguration: AgentConfigurationType,
  action: AgentActionConfigurationType
) => {
  const isDustGlobalAgent = agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST;
  return isDustGlobalAgent && action.name.startsWith("hidden_dust_search_");
};

export function AssistantToolsSection({
  agentConfiguration,
  owner,
}: AssistantToolsSectionProps) {
  const { isDark } = useTheme();
  const { mcpServers } = useMCPServers({ owner });

  const actions = removeNulls(
    agentConfiguration.actions
      .filter((action) => !isHiddenDustAction(agentConfiguration, action))
      .map((action) => renderOtherAction(action, mcpServers))
  );
  if (agentConfiguration.visualizationEnabled) {
    actions.push({
      title: "Visualize",
      avatar: <Avatar icon={BarChartIcon} size="xs" />,
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

  // TODO(20250626, aubin): Add model used for reasoning in details following
  // regression when moving reasoning to MCP.

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
                {action.avatar}
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
                  icon={getModelProviderLogo(model.providerId, isDark)}
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
  if (isServerSideMCPServerConfiguration(action)) {
    const mcpServer = mcpServers.find((s) =>
      s.views.some((v) => v.sId === action.mcpServerViewId)
    );
    if (!mcpServer) {
      return null;
    }
    const { serverType } = getServerTypeAndIdFromSId(mcpServer.sId);
    const avatar = getAvatar(mcpServer, "xs");
    return {
      title: getMcpServerDisplayName(mcpServer),
      avatar,
      order: serverType === "internal" ? 1 : 3,
    };
  } else if (isMCPServerConfiguration(action)) {
    return {
      title: action.name,
      avatar: <Avatar icon={CommandIcon} size="xs" />,
      order: 3,
    };
  } else {
    return assertNever(action);
  }
}
