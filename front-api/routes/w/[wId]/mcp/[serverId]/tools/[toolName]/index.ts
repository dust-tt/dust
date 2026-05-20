import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

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

// Mounted at /api/w/:wId/mcp/:serverId/tools/:toolName.
const app = new Hono();

app.patch("/", validate("json", UpdateMCPToolSettingsBodySchema), async (c) => {
  const auth = c.get("auth");
  const serverId = c.req.param("serverId") ?? "";
  const toolName = c.req.param("toolName") ?? "";

  if (!auth.isUser()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "mcp_auth_error",
        message:
          "You are not authorized to make request to inspect an MCP server.",
      },
    });
  }

  const { id } = getServerTypeAndIdFromSId(serverId);
  if (!id) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid server ID.",
      },
    });
  }

  const { permission, enabled } = c.req.valid("json");

  await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
    serverSId: serverId,
    toolName,
    permission: permission ?? "high",
    enabled: enabled ?? true,
  });

  return c.json({ success: true });
});

export default app;
