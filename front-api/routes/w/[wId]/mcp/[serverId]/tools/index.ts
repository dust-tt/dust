import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { PatchMCPServerToolsPermissionsResponseBody } from "@app/lib/api/mcp";
import { UpdateMCPToolsSettingsBodySchema } from "@app/lib/api/mcp_schemas";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsUser } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tool from "./[toolName]";

// Mounted under /api/w/:wId/mcp/:serverId/tools.
const app = workspaceApp();

const ParamsSchema = z.object({
  serverId: z.string(),
});

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  ensureIsUser(),
  validate("json", UpdateMCPToolsSettingsBodySchema),
  async (ctx): HandlerResult<PatchMCPServerToolsPermissionsResponseBody> => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("param");
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

    const { tools } = ctx.req.valid("json");
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettingsBatch(
      auth,
      { serverId, tools }
    );

    return ctx.json({ success: true });
  }
);

app.route("/:toolName", tool);

export default app;
