import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";

import type { RemoteMCPToolAsset, SeedContext } from "./types";

/**
 * Seeds a fake remote MCP server and exposes it in the global space, so it can be referenced as
 * a `<tool />` in skill instructions. Returns the global-space view, or null on dry runs.
 *
 * Idempotent: an existing server with the same name is reused, and its global-space view is
 * created only when missing.
 */
export async function seedRemoteMCPTool(
  ctx: SeedContext,
  asset: RemoteMCPToolAsset
): Promise<MCPServerViewResource | null> {
  const { auth, workspace, execute, logger } = ctx;

  const existingServers = await RemoteMCPServerResource.listByWorkspace(auth);
  let server = existingServers.find((s) => s.cachedName === asset.name);

  if (server) {
    logger.info(
      { sId: server.sId, name: asset.name },
      "Remote MCP tool already exists, skipping"
    );
  } else {
    logger.info({ name: asset.name }, "Creating remote MCP tool...");
    if (!execute) {
      return null;
    }
    server = await RemoteMCPServerFactory.create(
      renderLightWorkspaceType({ workspace }),
      {
        name: asset.name,
        url: asset.url,
        description: asset.description,
        tools: asset.tools.map((tool) => ({ ...tool, inputSchema: undefined })),
      }
    );
    logger.info(
      { sId: server.sId, name: asset.name },
      "Remote MCP tool created"
    );
  }

  const globalView = await MCPServerViewResource.getMCPServerViewForGlobalSpace(
    auth,
    server.sId
  );
  if (globalView) {
    return globalView;
  }

  if (!execute) {
    return null;
  }

  const systemView = await MCPServerViewResource.getMCPServerViewForSystemSpace(
    auth,
    server.sId
  );
  if (!systemView) {
    throw new Error(`No system view found for remote MCP server ${server.sId}`);
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const { view } = await MCPServerViewResource.create(auth, {
    systemView,
    space: globalSpace,
  });
  logger.info(
    { sId: view.sId, name: asset.name },
    "Remote MCP tool shared in the global space"
  );

  return view;
}
