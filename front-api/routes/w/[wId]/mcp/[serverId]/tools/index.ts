import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { BatchUpdateMCPToolSettingsResponseBody } from "@app/lib/api/mcp";
import { BatchUpdateMCPToolSettingsBodySchema } from "@app/lib/api/mcp_schemas";
import { DustError } from "@app/lib/error";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsUser } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tool from "./[toolName]";

const ParamsSchema = z.object({
  serverId: z.string(),
});

// Mounted under /api/w/:wId/mcp/:serverId/tools.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  ensureIsUser(),
  validate("json", BatchUpdateMCPToolSettingsBodySchema),
  async (ctx): HandlerResult<BatchUpdateMCPToolSettingsResponseBody> => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("param");

    try {
      getServerTypeAndIdFromSId(serverId);
    } catch {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid server ID.",
        },
      });
    }

    const { tools } = ctx.req.valid("json");

    try {
      const updatedTools =
        await RemoteMCPServerToolMetadataResource.batchUpdateOrCreateSettings(
          auth,
          {
            serverSId: serverId,
            tools,
          }
        );

      return ctx.json({ success: true, updatedCount: updatedTools.length });
    } catch (error) {
      if (error instanceof DustError && error.code === "unauthorized") {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message: error.message,
          },
        });
      }
      throw error;
    }
  }
);

app.route("/:toolName", tool);

export default app;
