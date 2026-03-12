import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
  getMcpServerDisplayName,
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  getServerTypeAndIdFromSId,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { matchesInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import {
  isMCPServerConfiguration,
  isServerSideMCPServerConfiguration,
  isServerSideMCPServerConfigurationWithName,
} from "@app/lib/actions/types/guards";
import type {
  MCPServerTypeWithViews,
  MCPServerViewType,
} from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useMCPServers, useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useAgentConfigurationSkills } from "@app/lib/swr/skills";
import { useSpaces } from "@app/lib/swr/spaces";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  CommandIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
// biome-ignore lint/plugin/noBulkLodash: existing usage
import _ from "lodash";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

interface AssistantToolsSectionProps {
  agentConfiguration: AgentConfigurationType;
  owner: LightWorkspaceType;
  isDustAgent: boolean;
}

const TOOLS_INITIAL_COUNT = 10;

interface ActionData {
  title: string;
  description: string | null;
  avatar: ReactNode;
  order: number;
}

function isActionData(
  item: ActionData | MCPServerViewType
): item is ActionData {
  return "avatar" in item;
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
function isHiddenDustAction(action: MCPServerConfigurationType): boolean {
  if (action.name.startsWith("hidden_dust_search_")) {
    return true;
  }
  if (isServerSideMCPServerConfiguration(action)) {
    return HIDDEN_DUST_ACTIONS.some((serverName) =>
      matchesInternalMCPServerName(action.internalMCPServerId, serverName)
    );
  }
  return false;
}

export function AssistantSkillsToolsSection({
  agentConfiguration,
  owner,
  isDustAgent,
}: AssistantToolsSectionProps) {
  const { mcpServers, isMCPServersLoading: isToolsLoading } = useMCPServers({
    owner,
  });
  const { skills, isSkillsLoading } = useAgentConfigurationSkills({
    owner,
    agentConfigurationId: agentConfiguration.sId,
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

  const allTools = useMemo(
    () => [...sortedActions, ...availableToolsets],
    [sortedActions, availableToolsets]
  );

  const [visibleToolsCount, setVisibleToolsCount] =
    useState(TOOLS_INITIAL_COUNT);
  const visibleTools = allTools.slice(0, visibleToolsCount);
  const hasMore = allTools.length > visibleToolsCount;

  const hasTools = allTools.length > 0;
  const hasSkills = skills.length > 0;

  return (
    <div className="flex flex-col gap-5">
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
              visibleTools.map((tool) => {
                if (isActionData(tool)) {
                  return (
                    <Tooltip
                      key={tool.title}
                      label={tool.description ?? tool.title}
                      trigger={
                        <div className="flex flex-row items-center gap-2">
                          {tool.avatar}
                          <div className="truncate">{tool.title}</div>
                        </div>
                      }
                      tooltipTriggerAsChild
                    />
                  );
                }
                const avatar = getAvatarFromIcon(tool.server.icon, "xs");
                const displayName = getMcpServerViewDisplayName(tool);
                const description = getMcpServerViewDescription(tool);
                return (
                  <Tooltip
                    key={tool.sId}
                    label={description ?? displayName}
                    trigger={
                      <div className="flex flex-row items-center gap-2">
                        {avatar}
                        <div className="truncate">{displayName}</div>
                      </div>
                    }
                    tooltipTriggerAsChild
                  />
                );
              })
            )}
          </div>
          {hasMore && (
            <div className="flex w-full justify-center">
              <Button
                label={`Show all ${allTools.length} tools`}
                variant="outline"
                size="xs"
                onClick={() => setVisibleToolsCount(allTools.length)}
              />
            </div>
          )}
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
      agentConfiguration.actions.find((action) =>
        isServerSideMCPServerConfigurationWithName(action, "toolsets")
      ),
    [agentConfiguration.actions]
  );

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    disabled: !toolsetsAction,
  });
  const globalSpace = spaces[0] ?? undefined;

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
): ActionData | null {
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
    assertNeverAndIgnore(action);
    return null;
  }
}
