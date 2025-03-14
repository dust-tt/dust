import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type {
  DustAppRunConfigurationType,
  ModelId,
  UnsavedAgentActionConfigurationType,
} from "@app/types";
import { isDustAppRunConfiguration, removeNulls } from "@app/types";

export async function listAgentConfigurationsForGroups(
  auth: Authenticator,
  groups: GroupResource[]
) {
  return AgentConfiguration.findAll({
    attributes: ["sId", "groupIds"],
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
      action.type === "tables_query_configuration"
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
      }
      return [];
    })
  );
}

export async function getAgentConfigurationGroupIdsFromActions(
  auth: Authenticator,
  actions: UnsavedAgentActionConfigurationType[]
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
    if (!spacePermissions.has(spaceId)) {
      spacePermissions.set(spaceId, new Set());
    }
    const groups = view
      .requestedPermissions()
      .flatMap((rp) => rp.groups.map((g) => g.id))
      // Sort to ensure consistent ordering.
      .sort((a, b) => a - b);

    groups.forEach((g) => spacePermissions.get(spaceId)!.add(g));
  }

  // Collect DustApp permissions by space.
  for (const app of dustApps) {
    const { sId: spaceId } = app.space;
    if (!spacePermissions.has(spaceId)) {
      spacePermissions.set(spaceId, new Set());
    }

    const groups = app
      .requestedPermissions()
      .flatMap((rp) => rp.groups.map((g) => g.id))
      // Sort to ensure consistent ordering.
      .sort((a, b) => a - b);

    groups.forEach((g) => spacePermissions.get(spaceId)!.add(g));
  }

  // Convert Map to array of arrays, filtering out empty sets.
  return Array.from(spacePermissions.values())
    .map((set) => Array.from(set))
    .filter((arr) => arr.length > 0);
}
