import { Hono } from "hono";
import { z } from "zod";

import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { fetchRemoteServerMetaDataByServerId } from "@app/lib/actions/mcp_metadata";
import type { MCPServerType } from "@app/lib/api/mcp";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";

import { validate } from "../../../middleware/validator";

export type SyncMCPServerResponseBody = {
  success: boolean;
  server: MCPServerType;
};

const UpdateMCPToolSettingsBodySchema = z
  .object({
    permission: z.enum(MCP_TOOL_STAKE_LEVELS).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (data) => data.permission !== undefined || data.enabled !== undefined,
    {
      message: "At least one of 'permission' or 'enabled' must be provided.",
    }
  );

export type UpdateMCPToolSettingsBodyType = z.infer<
  typeof UpdateMCPToolSettingsBodySchema
>;

export type PatchMCPServerToolsPermissionsResponseBody = {
  success: boolean;
};

// Mounted under /api/w/:wId/mcp/:serverId.
export const serverApp = new Hono();

// POST /sync — admin-only, refreshes the cached metadata for a remote MCP server.
serverApp.post("/sync", async (c) => {
  const auth = c.get("auth");
  // serverId is guaranteed present: the parent route is mounted at /:serverId.
  const serverId = c.req.param("serverId") ?? "";

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "data_source_auth_error",
          message:
            "Only users that are `admins` for the current workspace can manage MCP servers.",
        },
      },
      403
    );
  }

  const server = await RemoteMCPServerResource.fetchById(auth, serverId);
  if (!server) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "Remote MCP Server not found",
        },
      },
      404
    );
  }

  const r = await fetchRemoteServerMetaDataByServerId(auth, server.sId);
  if (r.isErr()) {
    await server.markAsErrored(auth, {
      lastError: r.error.message,
      lastSyncAt: new Date(),
    });
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: `Error fetching remote server metadata: ${r.error.message}`,
        },
      },
      400
    );
  }

  const metadata = r.value;
  await server.updateMetadata(auth, {
    cachedName: metadata.name,
    cachedDescription: metadata.description,
    cachedTools: metadata.tools,
    lastSyncAt: new Date(),
    clearError: true,
  });

  return c.json({ success: true, server: server.toJSON() });
});

// PATCH /tools/:toolName — update per-tool permission / enabled flag.
serverApp.patch(
  "/tools/:toolName",
  validate("json", UpdateMCPToolSettingsBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const serverId = c.req.param("serverId") ?? "";
    const toolName = c.req.param("toolName") ?? "";

    if (!auth.isUser()) {
      return c.json(
        {
          error: {
            type: "mcp_auth_error",
            message:
              "You are not authorized to make request to inspect an MCP server.",
          },
        },
        401
      );
    }

    const { id } = getServerTypeAndIdFromSId(serverId);
    if (!id) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Invalid server ID.",
          },
        },
        400
      );
    }

    const { permission, enabled } = c.req.valid("json");

    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: serverId,
      toolName,
      permission: permission ?? "high",
      enabled: enabled ?? true,
    });

    return c.json({ success: true });
  }
);
