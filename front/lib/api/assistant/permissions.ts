import uniq from "lodash/uniq";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  CombinedResourcePermissions,
  ContentFragmentInputWithContentNode,
  ModelId,
} from "@app/types";
import { removeNulls } from "@app/types";

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
  const ignoreSpaceModelIds = new Set(ignoreSpaces?.map((space) => space.id));

  // Collect DataSourceView permissions by space.
  const dsViews = await DataSourceViewResource.fetchByIds(
    auth,
    getDataSourceViewIdsFromActions(actions)
  );
  const dsViewRequirements = dsViews.map((view) => view.space.id);

  // Collect MCPServerView permissions by space.
  const mcpServerViewRequirements =
    await MCPServerViewResource.listSpaceRequirementsByIds(
      auth,
      actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.mcpServerViewId)
    );

  // Collect Dust App permissions by space.
  const dustAppIds = removeNulls(
    actions
      .filter(isServerSideMCPServerConfiguration)
      .map((action) => action.dustAppConfiguration?.appId)
  );
  let dustAppRequirements: ModelId[] = [];

  if (dustAppIds.length > 0) {
    const dustApps = await AppResource.fetchByIds(auth, dustAppIds);
    dustAppRequirements = dustApps.map((app) => app.space.id);
  }

  const requestedSpaceIds = uniq([
    ...dsViewRequirements,
    ...mcpServerViewRequirements,
    ...dustAppRequirements,
  ]).filter((id) => !ignoreSpaceModelIds.has(id));

  return { requestedSpaceIds };
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
