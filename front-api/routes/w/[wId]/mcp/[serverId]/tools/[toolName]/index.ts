import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsUser } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
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
const app = workspaceApp();

app.patch(
  "/",
  ensureIsUser(),
  validate("json", UpdateMCPToolSettingsBodySchema),
  async (ctx): HandlerResult<PatchMCPServerToolsPermissionsResponseBody> => {
    const auth = ctx.get("auth");
    const serverId = ctx.req.param("serverId") ?? "";
    const toolName = ctx.req.param("toolName") ?? "";

    const { id } = getServerTypeAndIdFromSId(serverId);
    if (!id) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid server ID.",
        },
      });
    }

    const { permission, enabled } = ctx.req.valid("json");

    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: serverId,
      toolName,
      permission: permission ?? "high",
      enabled: enabled ?? true,
    });

    return ctx.json({ success: true });
  }
);

export default app;
