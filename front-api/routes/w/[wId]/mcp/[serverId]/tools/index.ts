import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { PatchMCPServerToolsPermissionsResponseBody } from "@app/lib/api/mcp";
import { UpdateMCPToolsSettingsBodySchema } from "@app/lib/api/mcp_schemas";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
    const { tools } = ctx.req.valid("json");
    const updateResult =
      await RemoteMCPServerToolMetadataResource.updateOrCreateSettingsBatch(
        auth,
        { serverId, tools }
      );

    if (updateResult.isErr()) {
      switch (updateResult.error.code) {
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateResult.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: updateResult.error.message,
            },
          });
        default:
          return assertNever(updateResult.error.code);
      }
    }

    void emitAuditLogEvent({
      auth,
      action: "mcp_server.tool_settings_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        server_id: serverId,
        tool_count: String(tools.length),
      },
    });

    return ctx.json({ success: true });
  }
);

app.route("/:toolName", tool);

export default app;
