import { EditedSectionBar } from "@app/components/assistant/details/DetailsSectionHeading";
import { useEditedAgentSections } from "@app/components/assistant/details/SuggestionPreviewContext";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
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
  MCPServerViewLightType,
  MCPServerViewType,
} from "@app/lib/api/mcp";
import type { PreviewedAgentCapabilities } from "@app/lib/editor/preview_agent_suggestions";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useMCPServers, useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useAgentConfigurationSkills } from "@app/lib/swr/skills";
import { useSpaces } from "@app/lib/swr/spaces";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, Button, Command, Spinner, Tooltip } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import sortBy from "lodash/sortBy";
import uniqBy from "lodash/uniqBy";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

interface AssistantToolsSectionProps {
  agentConfiguration: AgentConfigurationType;
  previewedCapabilities: PreviewedAgentCapabilities | null;
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
  previewedCapabilities,
  owner,
  isDustAgent,
}: AssistantToolsSectionProps) {
  const { t } = useLingui();
  const editedSections = useEditedAgentSections();
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

  const serverViewsById = useMemo(
    () =>
      new Map(
        mcpServers.flatMap((server) =>
          server.views.map((view): [string, ServerView] => [
            view.sId,
            { server, view },
          ])
        )
      ),
    [mcpServers]
  );

  const sortedActions = useMemo(() => {
    const removedToolIds = new Set(previewedCapabilities?.removedToolIds);
    const removedSubAgentIds = new Set(
      previewedCapabilities?.removedSubAgentIds
    );
    const isRemovedTool = (action: MCPServerConfigurationType) =>
      isServerSideMCPServerConfiguration(action) &&
      (removedToolIds.has(action.mcpServerViewId) ||
        (action.childAgentId !== null &&
          removedSubAgentIds.has(action.childAgentId)));

    const currentToolIds = new Set(
      agentConfiguration.actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.mcpServerViewId)
    );

    const keptTools = agentConfiguration.actions
      .filter((action) => (isDustAgent ? !isHiddenDustAction(action) : true))
      .filter((action) => !isRemovedTool(action))
      .map((action) => renderOtherAction(action, serverViewsById));

    const addedTools = (previewedCapabilities?.addedToolIds ?? [])
      .filter((toolId) => !currentToolIds.has(toolId))
      .map((toolId) => renderServerSideTool(serverViewsById.get(toolId)));

    const actions = removeNulls([...keptTools, ...addedTools]);
    return sortBy(uniqBy(actions, "title"), ["order", "title"]);
  }, [
    agentConfiguration.actions,
    serverViewsById,
    isDustAgent,
    previewedCapabilities,
  ]);

  const sortedSkills = useMemo(() => {
    const removedSkillIds = new Set(previewedCapabilities?.removedSkillIds);
    return sortBy(
      skills.filter((skill) => !removedSkillIds.has(skill.sId)),
      "name"
    );
  }, [skills, previewedCapabilities]);

  const addedSkillIds = useMemo(() => {
    const currentSkillIds = new Set(skills.map((skill) => skill.sId));
    return (previewedCapabilities?.addedSkillIds ?? []).filter(
      (skillId) => !currentSkillIds.has(skillId)
    );
  }, [skills, previewedCapabilities]);

  const addedSubAgentIds = useMemo(() => {
    const currentSubAgentIds = new Set(
      agentConfiguration.actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.childAgentId)
    );
    return (previewedCapabilities?.addedSubAgentIds ?? []).filter(
      (subAgentId) => !currentSubAgentIds.has(subAgentId)
    );
  }, [agentConfiguration.actions, previewedCapabilities]);

  const allTools = useMemo(
    () => [...sortedActions, ...availableToolsets],
    [sortedActions, availableToolsets]
  );

  const [visibleToolsCount, setVisibleToolsCount] =
    useState(TOOLS_INITIAL_COUNT);
  const visibleTools = allTools.slice(0, visibleToolsCount);
  const hasMore = allTools.length > visibleToolsCount;
  const toolsCount = allTools.length;

  const hasTools = allTools.length > 0 || addedSubAgentIds.length > 0;
  const hasSkills = sortedSkills.length > 0 || addedSkillIds.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {hasSkills && (
        <div className="relative flex flex-col gap-5">
          {editedSections.has("skills") && <EditedSectionBar />}
          <div className="heading-lg text-foreground">
            <Trans>Skills</Trans>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isSkillsLoading ? (
              <div className="flex flex-row items-center gap-2">
                <Spinner size="xs" />
              </div>
            ) : (
              <>
                {sortedSkills.map((skill) => (
                  <SkillItem key={skill.sId} skill={skill} />
                ))}
                {addedSkillIds.map((skillId) => (
                  <AddedSkillItem
                    key={skillId}
                    owner={owner}
                    skillId={skillId}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {hasTools && (
        <div className="relative flex flex-col gap-5">
          {editedSections.has("tools") && <EditedSectionBar />}
          <div className="heading-lg text-foreground">
            <Trans>Tools</Trans>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isToolsLoading || isToolsetsLoading ? (
              <div className="flex flex-row items-center gap-2">
                <Spinner size="xs" />
              </div>
            ) : (
              <>
                {visibleTools.map((tool) => {
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
                })}
                {addedSubAgentIds.map((subAgentId) => (
                  <AddedSubAgentItem
                    key={subAgentId}
                    owner={owner}
                    subAgentId={subAgentId}
                  />
                ))}
              </>
            )}
          </div>
          {hasMore && (
            <div className="flex w-full justify-center">
              <Button
                label={t`${plural(toolsCount, {
                  one: "Show all # tool",
                  other: "Show all # tools",
                })}`}
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

interface SkillItemProps {
  skill: SkillType;
}

function SkillItem({ skill }: SkillItemProps) {
  const SkillAvatar = getSkillAvatarIcon(skill);
  return (
    <div className="flex flex-row items-center gap-2">
      <SkillAvatar size="xs" />
      <div>{skill.name}</div>
    </div>
  );
}

interface AddedSkillItemProps {
  owner: LightWorkspaceType;
  skillId: string;
}

function AddedSkillItem({ owner, skillId }: AddedSkillItemProps) {
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
    shouldRetryOnError: false,
  });
  if (isSkillLoading) {
    return <Spinner size="xs" />;
  }
  return skill ? <SkillItem skill={skill} /> : null;
}

interface AddedSubAgentItemProps {
  owner: LightWorkspaceType;
  subAgentId: string;
}

function AddedSubAgentItem({ owner, subAgentId }: AddedSubAgentItemProps) {
  const { agentConfiguration: subAgent, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: subAgentId,
    });
  if (isAgentConfigurationLoading) {
    return <Spinner size="xs" />;
  }
  if (!subAgent) {
    return null;
  }
  return (
    <Tooltip
      label={subAgent.description || subAgent.name}
      trigger={
        <div className="flex flex-row items-center gap-2">
          <Avatar size="xs" visual={subAgent.pictureUrl} />
          <div className="truncate">@{subAgent.name}</div>
        </div>
      }
      tooltipTriggerAsChild
    />
  );
}

interface ServerView {
  server: MCPServerTypeWithViews<MCPServerViewLightType>;
  view: MCPServerViewLightType;
}

function renderServerSideTool(
  serverView: ServerView | undefined,
  action?: MCPServerConfigurationType
): ActionData | null {
  if (!serverView) {
    return null;
  }
  const { server, view } = serverView;
  const { serverType } = getServerTypeAndIdFromSId(server.sId);

  return {
    title: getMcpServerViewDisplayName(view, action),
    description: getMcpServerViewDescription(view),
    avatar: getAvatar(server, "xs"),
    order: serverType === "internal" ? 1 : 3,
  };
}

function renderOtherAction(
  action: MCPServerConfigurationType,
  serverViewsById: Map<string, ServerView>
): ActionData | null {
  if (isServerSideMCPServerConfiguration(action)) {
    return renderServerSideTool(
      serverViewsById.get(action.mcpServerViewId),
      action
    );
  } else if (isMCPServerConfiguration(action)) {
    return {
      title: asDisplayName(action.name),
      description: action.description,
      avatar: <Avatar icon={Command} size="xs" />,
      order: 3,
    };
  } else {
    assertNeverAndIgnore(action);
    return null;
  }
}
