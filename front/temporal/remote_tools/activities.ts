import { fetchRemoteServerMetaDataByServerId } from "@app/lib/actions/mcp_metadata";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";

export async function syncRemoteMCPServers(ids: number[]): Promise<void> {
  logger.info({ msg: "Starting sync of remote_mcp_servers" });

  try {
    for (const id of ids) {
      // Retrieve the remote MCP server
      const server = await RemoteMCPServerResource.fetchByModelId(id);
      if (!server) {
        logger.error({
          msg: "Remote MCP server not found",
          serverId: id,
        });
        continue;
      }

      // Retrieve the workspace
      const workspace = await WorkspaceResource.fetchByModelId(
        server.workspaceId
      );
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
      const r = await fetchRemoteServerMetaDataByServerId(auth, server.sId);

      if (r.isErr()) {
        logger.error(
          {
            workspaceId,
            serverId: server.sId,
            url: server.url,
            error: r.error.message,
          },
          "Error fetching remote server metadata"
        );
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

/**
 * Returns a batch of up to 100 RemoteMCPServerResource servers and a function to get the next batch.
 */

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export  async function getBatchRemoteMCPServers({
  firstId = 0,
  limit = 100,
}: {
  firstId?: number;
  limit?: number;
}): Promise<number[]> {
  return RemoteMCPServerResource.dangerouslyListAllServersIds({
    firstId,
    limit,
  });
}
