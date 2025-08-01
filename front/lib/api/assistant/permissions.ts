import { Op } from "sequelize";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
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
  actions: UnsavedMCPServerConfigurationType[]
): string[] {
  const relevantActions = actions.filter(
    (action): action is ServerSideMCPServerConfigurationType =>
      action.type === "mcp_server_configuration" &&
      isServerSideMCPServerConfiguration(action)
  );

  return removeNulls(
    relevantActions.flatMap((action) => {
      if (action.dataSources) {
        return action.dataSources.map(
          (dataSource) => dataSource.dataSourceViewId
        );
      } else if (action.tables) {
        return action.tables.map((table) => table.dataSourceViewId);
      } else {
        return [];
      }
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

export async function getAgentConfigurationGroupIdsFromActions(
  auth: Authenticator,
  params: {
    actions: UnsavedMCPServerConfigurationType[];
    ignoreSpaces?: SpaceResource[];
  }
): Promise<ModelId[][]> {
  const { actions, ignoreSpaces } = params;
  const ignoreSpaceIds = new Set(ignoreSpaces?.map((space) => space.sId));

  const dsViews = await DataSourceViewResource.fetchByIds(
    auth,
    getDataSourceViewIdsFromActions(actions)
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

  // Collect Dust App permissions by space.
  const dustAppIds = removeNulls(
    actions
      .filter(isServerSideMCPServerConfiguration)
      .map((action) => action.dustAppConfiguration?.appId)
  );

  if (dustAppIds.length > 0) {
    const dustApps = await AppResource.fetchByIds(auth, dustAppIds);

    for (const app of dustApps) {
      const { sId: spaceId } = app.space;
      if (ignoreSpaceIds?.has(spaceId)) {
        continue;
      }
      if (!spacePermissions.has(spaceId)) {
        spacePermissions.set(spaceId, new Set());
      }
      const groups = groupsFromRequestedPermissions(
        app.space.requestedPermissions()
      );
      groups.forEach((g) => spacePermissions.get(spaceId)!.add(g));
    }
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
