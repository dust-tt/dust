import { Op } from "sequelize";

import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { UnsavedAgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isDustAppRunConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import {
  getAgentConfigurations,
  getAgentSIdFromName,
} from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  CombinedResourcePermissions,
  ContentFragmentInputWithContentNode,
  ModelId,
} from "@app/types";
import { removeNulls } from "@app/types";

export async function listAgentConfigurationsForGroups(
  auth: Authenticator,
  groups: GroupResource[]
) {
  return AgentConfiguration.findAll({
    attributes: ["sId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      status: "active",
      // This checks for PARTIAL matches in group requirements, not exact matches.
      // Op.contains will match if ANY array in `requestedGroupIds` contains ALL elements of
      // [groups.map(g => g.id)]
      // Example: if groups=[1,2]
      //  - requestedGroupIds=[[1,2,3]] -> MATCH (contains all required elements plus more)
      //  - requestedGroupIds=[[1,2]] -> MATCH (exact match)
      //  - requestedGroupIds=[[1]] -> NO MATCH (missing element)
      requestedGroupIds: {
        [Op.contains]: [groups.map((g) => g.id)],
      },
    },
  });
}

export function getDataSourceViewIdsFromActions(
  actions: UnsavedAgentActionConfigurationType[]
): string[] {
  const relevantActions = actions.filter(
    (action) =>
      action.type === "retrieval_configuration" ||
      action.type === "process_configuration" ||
      action.type === "tables_query_configuration" ||
      (action.type === "mcp_server_configuration" &&
        isServerSideMCPServerConfiguration(action))
  );

  return removeNulls(
    relevantActions.flatMap((action) => {
      if (
        action.type === "retrieval_configuration" ||
        action.type === "process_configuration"
      ) {
        return action.dataSources.map(
          (dataSource) => dataSource.dataSourceViewId
        );
      } else if (action.type === "tables_query_configuration") {
        return action.tables.map((table) => table.dataSourceViewId);
      } else if (
        action.type === "mcp_server_configuration" &&
        isServerSideMCPServerConfiguration(action)
      ) {
        if (action.dataSources) {
          return action.dataSources.map(
            (dataSource) => dataSource.dataSourceViewId
          );
        } else if (action.tables) {
          return action.tables.map((table) => table.dataSourceViewId);
        } else {
          return [];
        }
      }
      return [];
    })
  );
}

export function groupsFromRequestedPermissions(
  requestedPermissions: CombinedResourcePermissions[]
) {
  return (
    requestedPermissions
      .flatMap((rp) => rp.groups.map((g) => g.id))
      // Sort to ensure consistent ordering.
      .sort((a, b) => a - b)
  );
}

/**
 * This is a wrapper function of getAgentConfigurationGroupIdsFromActions for simplicity of use.
 * Note: if you have the actions, use getAgentConfigurationGroupIdsFromActions as this is a less efficient function.
 *
 * @param auth - The authenticator instance for workspace access and permissions
 * @param agentName - The sId/name of the agent configuration to fetch group IDs for
 * @param ignoreSpaceIds - Optional set of space IDs to exclude from group requirements calculation
 * @returns Promise resolving to array of arrays, where each inner array contains ModelIds of groups required for one space
 * @throws Error if the agent configuration is not found
 */
export async function getAgentConfigurationGroupIdsFromName(
  auth: Authenticator,
  agentName: string,
  ignoreSpaceIds?: Set<string>
): Promise<ModelId[][]> {
  // Get the agent sId via name and auth
  const agentId = await getAgentSIdFromName(auth, agentName);

  if (!agentId) {
    throw new Error(`Agent Id not found: ${agentName}`);
  }

  // Get the agent configuration with full details including actions
  const [agentConfig] = await getAgentConfigurations({
    auth,
    agentsGetView: { agentIds: [agentId] },
    variant: "full",
    dangerouslySkipPermissionFiltering: true,
  });

  if (!agentConfig) {
    throw new Error(`Agent configuration not found: ${agentName}`);
  }

  // Get the required group IDs from the agent's actions
  return getAgentConfigurationGroupIdsFromActions(
    auth,
    agentConfig.actions,
    ignoreSpaceIds
  );
}

export async function getAgentConfigurationGroupIdsFromActions(
  auth: Authenticator,
  actions: UnsavedAgentActionConfigurationType[],
  ignoreSpaceIds?: Set<string>
): Promise<ModelId[][]> {
  const dsViews = await DataSourceViewResource.fetchByIds(
    auth,
    getDataSourceViewIdsFromActions(actions)
  );
  const dustApps = await AppResource.fetchByIds(
    auth,
    actions
      .filter((action) => isDustAppRunConfiguration(action))
      .map((action) => (action as DustAppRunConfigurationType).appId)
  );

  // Map spaceId to its group requirements.
  const spacePermissions = new Map<string, Set<number>>();

  // Collect DataSourceView permissions by space.
  for (const view of dsViews) {
    const { sId: spaceId } = view.space;
    if (ignoreSpaceIds?.has(spaceId)) {
      continue;
    }

    if (!spacePermissions.has(spaceId)) {
      spacePermissions.set(spaceId, new Set());
    }
    const groups = groupsFromRequestedPermissions(view.requestedPermissions());
    groups.forEach((g) => spacePermissions.get(spaceId)!.add(g));
  }

  // Collect DustApp permissions by space.
  for (const app of dustApps) {
    const { sId: spaceId } = app.space;
    if (ignoreSpaceIds?.has(spaceId)) {
      continue;
    }

    if (!spacePermissions.has(spaceId)) {
      spacePermissions.set(spaceId, new Set());
    }
    const groups = groupsFromRequestedPermissions(app.requestedPermissions());
    groups.forEach((g) => spacePermissions.get(spaceId)!.add(g));
  }

  // Collect MCPServerView permissions by space.
  const mcpServerViews = await MCPServerViewResource.fetchByIds(
    auth,
    actions
      .filter((action) => isServerSideMCPServerConfiguration(action))
      .map(
        (action) =>
          (action as ServerSideMCPServerConfigurationType).mcpServerViewId
      )
  );

  for (const view of mcpServerViews) {
    const { sId: spaceId } = view.space;
    if (ignoreSpaceIds?.has(spaceId)) {
      continue;
    }
    if (!spacePermissions.has(spaceId)) {
      spacePermissions.set(spaceId, new Set());
    }
    const groups = groupsFromRequestedPermissions(view.requestedPermissions());
    groups.forEach((g) => spacePermissions.get(spaceId)!.add(g));
  }

  // Convert Map to array of arrays, filtering out empty sets.
  return Array.from(spacePermissions.values())
    .map((set) => Array.from(set))
    .filter((arr) => arr.length > 0);
}

export async function getContentFragmentGroupIds(
  auth: Authenticator,
  contentFragment: ContentFragmentInputWithContentNode
): Promise<ModelId[][]> {
  const dsView = await DataSourceViewResource.fetchById(
    auth,
    contentFragment.nodeDataSourceViewId
  );
  if (!dsView) {
    throw new Error(`Unexpected dataSourceView not found`);
  }

  const groups = groupsFromRequestedPermissions(dsView.requestedPermissions());

  return [groups].filter((arr) => arr.length > 0);
}
