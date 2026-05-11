import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { makeScript } from "@app/scripts/helpers";

const OLD_URL = "https://mcp.asana.com/sse";
const NEW_URL = "https://mcp.asana.com/v2/mcp";

// Asana V2 requires pre-registered OAuth clients (DCR is unavailable on
// app.asana.com). Existing rows were set up against the V1 `mcp` provider, so
// their authorization metadata and stored connections are useless for V2 and
// the admin must re-auth through the `mcp_static` flow.
const V2_AUTHORIZATION: AuthorizationInfo = {
  provider: "mcp_static",
  supported_use_cases: ["platform_actions", "personal_actions"],
};

makeScript({}, async ({ execute }, logger) => {
  const servers = await RemoteMCPServerModel.findAll({
    where: { url: OLD_URL },
  });

  logger.info(
    { count: servers.length },
    "Found Asana V1 MCP server instances."
  );

  for (const server of servers) {
    const serverLogger = logger.child({
      serverId: server.id,
      workspaceId: server.workspaceId,
    });

    if (execute) {
      await server.update({
        url: NEW_URL,
        lastSyncAt: null,
        cachedTools: [],
        authorization: V2_AUTHORIZATION,
      });
      await MCPServerConnectionModel.destroy({
        where: { remoteMCPServerId: server.id },
      });
      serverLogger.info(
        "Migrated Asana MCP server to V2 and cleared stale connections."
      );
    } else {
      const connectionCount = await MCPServerConnectionModel.count({
        where: { remoteMCPServerId: server.id },
      });
      serverLogger.info(
        { existingConnections: connectionCount },
        "Would migrate Asana MCP server to V2 and delete stale connections."
      );
    }
  }

  logger.info(
    { processedCount: servers.length },
    execute
      ? "Migration completed successfully."
      : "Dry-run completed. Use --execute to apply changes."
  );
});
