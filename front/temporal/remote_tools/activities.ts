import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerModel } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { getWorkspaceByModelId } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function syncRemoteMCPServers(): Promise<void> {
  logger.info({ msg: "Starting sync of remote_mcp_servers" });

  try {
    const servers = await RemoteMCPServerModel.findAll();

    for (const s of servers) {
      // Retrieve the resource
      const server = await RemoteMCPServerResource.fetchByModelId(s.id);
      if (!server) {
        logger.error({
          msg: "Remote MCP server not found",
          serverId: s.id,
        });
        continue;
      }

      // Retrieve the authentication
      const workspace = await getWorkspaceByModelId(server.workspaceId);
      if (!workspace) {
        logger.error({
          msg: "Workspace not found for remote MCP server",
          workspaceId: server.workspaceId,
          serverId: server.sId,
        });
        continue;
      }
      const workspaceId = workspace.sId;
      const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

      // Fetch the remote server metadata
      const r = await fetchRemoteServerMetaDataByURL(auth, server.url);

      if (r.isErr()) {
        logger.error({
          msg: "Error fetching remote server metadata",
          workspaceId,
          serverId: server.sId,
          url: server.url,
          error: r.error.message,
        });
        await server.markAsErrored(auth, {
          lastError: r.error.message,
          lastSyncAt: new Date(),
        });
        continue;
      }

      const metadata = r.value;

      // Update the server metadata
      await server.updateMetadata(auth, {
        cachedName: metadata.name,
        cachedDescription: metadata.description,
        cachedTools: metadata.tools,
        lastSyncAt: new Date(),
        clearError: true,
      });

      logger.info({
        msg: "Successfully synced remote MCP server",
        workspaceId,
        serverId: server.sId,
        url: server.url,
      });
    }
  } catch (error) {
    logger.error({
      msg: "Failed to resync remote_mcp_servers",
      error,
    });
    throw error;
  }
}
