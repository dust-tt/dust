import { Avatar, CommandIcon, Spinner, Tooltip } from "@dust-tt/sparkle";
import _ from "lodash";
import { useMemo } from "react";

import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
  getMcpServerDisplayName,
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  getServerTypeAndIdFromSId,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { isInternalMCPServerOfName } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import {
  isMCPServerConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import type { MCPServerTypeWithViews } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useMCPServers, useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useAgentConfigurationSkills } from "@app/lib/swr/skills";
import { useSpaces } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { AgentConfigurationType, LightWorkspaceType } from "@app/types";
import { asDisplayName, assertNever, removeNulls } from "@app/types";

interface AssistantToolsSectionProps {
  agentConfiguration: AgentConfigurationType;
  owner: LightWorkspaceType;
  isDustAgent: boolean;
}

const HIDDEN_DUST_ACTIONS = [
  "toolsets",
  "agent_router",
  "data_sources_file_system",
  "data_warehouses",
] as const;

// Since Dust is configured with one search for all, plus individual searches for each managed data source,
// we hide these additional searches from the user in the UI to avoid displaying the same data source twice.
// We use the `hidden_dust_search_` prefix to identify these additional searches.
const isHiddenDustAction = (action: MCPServerConfigurationType) => {
  if (action.name.startsWith("hidden_dust_search_")) {
    return true;
  }
  if (isServerSideMCPServerConfiguration(action)) {
    return HIDDEN_DUST_ACTIONS.some((serverName) =>
      isInternalMCPServerOfName(action.internalMCPServerId, serverName)
    );
  }
  return false;
};

export function AssistantToolsSection({
  agentConfiguration,
  owner,
  isDustAgent,
}: AssistantToolsSectionProps) {
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const { mcpServers, isMCPServersLoading: isToolsLoading } = useMCPServers({
    owner,
  });
  const { skills, isSkillsLoading } = useAgentConfigurationSkills({
    owner,
    agentConfigurationSId: agentConfiguration.sId,
    disabled: !featureFlags.includes("skills"),
  });

  const { availableToolsets, isLoading: isToolsetsLoading } =
    useAvailableToolsets({
      owner,
      agentConfiguration,
    });

  const sortedActions = useMemo(() => {
    const actions = removeNulls(
      agentConfiguration.actions
        .filter((action) => (isDustAgent ? !isHiddenDustAction(action) : true))
        .map((action) => renderOtherAction(action, mcpServers))
    );
    return _.sortBy(_.uniqBy(actions, "title"), ["order", "title"]);
  }, [agentConfiguration.actions, mcpServers, isDustAgent]);

  const sortedSkills = useMemo(() => _.sortBy(skills, "name"), [skills]);

  const hasTools = sortedActions.length > 0 || availableToolsets.length > 0;
  const hasSkills = featureFlags.includes("skills") && skills.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {hasTools && (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Tools
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isToolsLoading || isToolsetsLoading ? (
              <div className="flex flex-row items-center gap-2">
                <Spinner size="xs" />
              </div>
            ) : (
              sortedActions.map((action) => (
                <Tooltip
                  key={action.title}
                  label={action.description ?? action.title}
                  trigger={
                    <div className="flex min-w-0 flex-row items-center gap-2">
                      <div className="flex-shrink-0">{action.avatar}</div>
                      <div className="truncate">{action.title}</div>
                    </div>
                  }
                  tooltipTriggerAsChild
                />
              ))
            )}
            {availableToolsets.map((view) => {
              const avatar = getAvatarFromIcon(view.server.icon, "xs");
              const displayName = getMcpServerViewDisplayName(view);
              const description = getMcpServerViewDescription(view);
              return (
                <Tooltip
                  key={view.sId}
                  label={description ?? displayName}
                  trigger={
                    <div className="flex min-w-0 flex-row items-center gap-2">
                      <div className="flex-shrink-0">{avatar}</div>
                      <div className="truncate">{displayName}</div>
                    </div>
                  }
                  tooltipTriggerAsChild
                />
              );
            })}
          </div>
        </div>
      )}

      {hasSkills && (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Skills
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isSkillsLoading ? (
              <div className="flex flex-row items-center gap-2">
                <Spinner size="xs" />
              </div>
            ) : (
              sortedSkills.map((skill) => {
                const SkillAvatar = getSkillAvatarIcon(skill.icon);
                return (
                  <div
                    className="flex flex-row items-center gap-2"
                    key={skill.sId}
                  >
                    <SkillAvatar size="xs" />
                    <div>{skill.name}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to fetch available toolsets for an agent configuration.
 * Only fetches data if the agent has a toolsets action configured.
 */
function useAvailableToolsets({
  owner,
  agentConfiguration,
}: {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType;
}) {
  const toolsetsAction = useMemo(
    () =>
      agentConfiguration.actions.find(
        (action) =>
          isServerSideMCPServerConfiguration(action) &&
          isInternalMCPServerOfName(action.internalMCPServerId, "toolsets")
      ),
    [agentConfiguration.actions]
  );

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: !toolsetsAction,
  });
  const globalSpace = spaces.find((s) => s.kind === "global");

  const { serverViews: globalServerViews, isMCPServerViewsLoading } =
    useMCPServerViews({
      owner,
      space: globalSpace,
      disabled: !toolsetsAction || !globalSpace,
    });

  const availableToolsets = useMemo(() => {
    if (!toolsetsAction) {
      return [];
    }
    const agentMcpServerViewIds = new Set(
      agentConfiguration.actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.mcpServerViewId)
    );
    return globalServerViews
      .filter((view) => !agentMcpServerViewIds.has(view.sId))
      .filter((view) => getMCPServerRequirements(view).noRequirement)
      .filter((view) => view.server.availability !== "auto_hidden_builder");
  }, [toolsetsAction, globalServerViews, agentConfiguration.actions]);

  return {
    availableToolsets,
    isLoading: isMCPServerViewsLoading,
  };
}

function renderOtherAction(
  action: MCPServerConfigurationType,
  mcpServers: MCPServerTypeWithViews[]
): {
  title: string;
  description: string | null;
  avatar: React.ReactNode;
  order: number;
} | null {
  if (isServerSideMCPServerConfiguration(action)) {
    const mcpServer = mcpServers.find((s) =>
      s.views.some((v) => v.sId === action.mcpServerViewId)
    );
    if (!mcpServer) {
      return null;
    }
    const view = mcpServer.views.find((v) => v.sId === action.mcpServerViewId);
    const { serverType } = getServerTypeAndIdFromSId(mcpServer.sId);
    const avatar = getAvatar(mcpServer, "xs");
    const title = view
      ? getMcpServerViewDisplayName(view, action)
      : getMcpServerDisplayName(mcpServer, action);
    const description = view
      ? getMcpServerViewDescription(view)
      : mcpServer.description;

    return {
      title,
      description,
      avatar,
      order: serverType === "internal" ? 1 : 3,
    };
  } else if (isMCPServerConfiguration(action)) {
    return {
      title: asDisplayName(action.name),
      description: action.description,
      avatar: <Avatar icon={CommandIcon} size="xs" />,
      order: 3,
    };
  } else {
    return assertNever(action);
  }
}
