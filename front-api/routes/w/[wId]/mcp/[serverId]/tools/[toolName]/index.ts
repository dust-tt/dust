import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type {
  PatchMCPServerToolsPermissionsResponseBody,
  UpdateMCPToolSettingsBodyType,
} from "@app/lib/api/mcp";
import { UpdateMCPToolSettingsBodySchema } from "@app/lib/api/mcp_schemas";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsUser } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type {
  PatchMCPServerToolsPermissionsResponseBody,
  UpdateMCPToolSettingsBodyType,
};

const ParamsSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
});

// Mounted at /api/w/:wId/mcp/:serverId/tools/:toolName.
const app = workspaceApp();

app.patch(
  "/",
  validate("param", ParamsSchema),
  ensureIsUser(),
  validate("json", UpdateMCPToolSettingsBodySchema),
  async (ctx): HandlerResult<PatchMCPServerToolsPermissionsResponseBody> => {
    const auth = ctx.get("auth");
    const { serverId, toolName } = ctx.req.valid("param");

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
