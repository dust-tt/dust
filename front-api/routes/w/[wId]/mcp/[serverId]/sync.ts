import { fetchRemoteServerMetaDataByServerId } from "@app/lib/actions/mcp_metadata";
import type { MCPServerType } from "@app/lib/api/mcp";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type SyncMCPServerResponseBody = {
  success: boolean;
  server: MCPServerType;
};

// Mounted at /api/w/:wId/mcp/:serverId/sync. Admin-only — refreshes the cached
// metadata for a remote MCP server.
const app = new Hono();

app.post("/", async (ctx): HandlerResult<SyncMCPServerResponseBody> => {
  const auth = ctx.get("auth");
  const serverId = ctx.req.param("serverId") ?? "";

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only users that are `admins` for the current workspace can manage MCP servers.",
      },
    });
  }

  const server = await RemoteMCPServerResource.fetchById(auth, serverId);
  if (!server) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Remote MCP Server not found",
      },
    });
  }

  const r = await fetchRemoteServerMetaDataByServerId(auth, server.sId);
  if (r.isErr()) {
    await server.markAsErrored(auth, {
      lastError: r.error.message,
      lastSyncAt: new Date(),
    });
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Error fetching remote server metadata: ${r.error.message}`,
      },
    });
  }

  const metadata = r.value;
  await server.updateMetadata(auth, {
    cachedName: metadata.name,
    cachedDescription: metadata.description,
    cachedTools: metadata.tools,
    lastSyncAt: new Date(),
    clearError: true,
  });

  return ctx.json({ success: true, server: server.toJSON() });
});

export default app;
