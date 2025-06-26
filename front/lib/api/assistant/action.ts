import tracer from "dd-trace";

import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

export const getAccessibleSourcesAndAppsForActions = async (auth: Authenticator) => {
  return tracer.trace("getAccessibleSourcesAndAppsForActions", async () => {
    const accessibleSpaces = (
      await SpaceResource.listWorkspaceSpaces(auth)
    ).filter((space) => !space.isSystem() && space.canRead(auth));

    const [dsViews, allDustApps, allMCPServerViews] = await Promise.all([
      DataSourceViewResource.listBySpaces(auth, accessibleSpaces, {
        includeEditedBy: true,
      }),
      AppResource.listByWorkspace(auth),
      MCPServerViewResource.listBySpaces(auth, accessibleSpaces),
    ]);

    return {
      spaces: accessibleSpaces,
      dataSourceViews: dsViews,
      dustApps: allDustApps,
      mcpServerViews: allMCPServerViews,
    };
  });
};