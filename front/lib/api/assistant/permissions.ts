import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getAvailabilityOfInternalMCPServerById } from "@app/lib/actions/mcp_internal_actions/constants";
import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type {
  CombinedResourcePermissions,
  ContentFragmentInputWithContentNode,
  ModelId,
} from "@app/types";
import { assertNever, removeNulls } from "@app/types";

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
      const dataSourceViewIds = new Set<string>();

      if (action.dataSources) {
        action.dataSources.forEach((dataSource) => {
          dataSourceViewIds.add(dataSource.dataSourceViewId);
        });
      }

      if (action.tables) {
        action.tables.forEach((table) => {
          dataSourceViewIds.add(table.dataSourceViewId);
        });
      }

      return Array.from(dataSourceViewIds);
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

export async function getAgentConfigurationRequirementsFromActions(
  auth: Authenticator,
  params: {
    actions: UnsavedMCPServerConfigurationType[];
    ignoreSpaces?: SpaceResource[];
  }
): Promise<{ requestedSpaceIds: ModelId[] }> {
  const { actions, ignoreSpaces } = params;
  const ignoreSpaceIds = new Set(ignoreSpaces?.map((space) => space.sId));

  const dsViews = await DataSourceViewResource.fetchByIds(
    auth,
    getDataSourceViewIdsFromActions(actions)
  );
  // Map spaceId to its group requirements.
  const spacePermissions = new Set<string>();

  // Collect DataSourceView permissions by space.
  for (const view of dsViews) {
    const { sId: spaceId } = view.space;
    if (ignoreSpaceIds?.has(spaceId)) {
      continue;
    }

    spacePermissions.add(spaceId);
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

    // We skip the permissions for internal tools as they are automatically available to all users.
    // This mimic the previous behavior of generic internal tools (search etc..).
    if (view.serverType === "internal") {
      const availability = getAvailabilityOfInternalMCPServerById(
        view.mcpServerId
      );
      switch (availability) {
        case "auto":
        case "auto_hidden_builder":
          continue;
        case "manual":
          break;
        default:
          assertNever(availability);
      }
    }

    spacePermissions.add(spaceId);
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

      spacePermissions.add(spaceId);
    }
  }

  // Convert Map to array of arrays, filtering out empty sets.
  return {
    requestedSpaceIds: removeNulls(
      Array.from(spacePermissions).map(getResourceIdFromSId)
    ),
  };
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

export async function getContentFragmentSpaceIds(
  auth: Authenticator,
  contentFragment: ContentFragmentInputWithContentNode
): Promise<string> {
  const dsView = await DataSourceViewResource.fetchById(
    auth,
    contentFragment.nodeDataSourceViewId
  );
  if (!dsView) {
    throw new Error(`Unexpected dataSourceView not found`);
  }

  return SpaceResource.modelIdToSId({
    id: dsView.space.id,
    workspaceId: auth.getNonNullableWorkspace().id,
  });
}
