/** @ignoreswagger */
import config from "@app/lib/api/config";
import type { PickerTokenResponseType } from "@app/lib/api/google_drive";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const RequestBodySchema = z.object({
  // The MCP server ID (e.g., "google_drive") - used to look up the OAuth connection
  mcpServerId: z.string().min(1, "mcpServerId is required"),
});

// Mounted at /api/w/:wId/google_drive/picker_token.
const app = workspaceApp();

app.post(
  "/",
  validate("json", RequestBodySchema),
  async (ctx): HandlerResult<PickerTokenResponseType> => {
    const auth = ctx.get("auth");
    const { mcpServerId } = ctx.req.valid("json");

    // Use whichever connection type the tool is configured for.
    const views = await MCPServerViewResource.listByMCPServer(
      auth,
      mcpServerId
    );
    const connectionType =
      views[0]?.oAuthUseCase === "platform_actions" ? "workspace" : "personal";

    const connectionResult = await MCPServerConnectionResource.findByMCPServer(
      auth,
      {
        mcpServerId,
        connectionType,
      }
    );

    if (connectionResult.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message:
            "No Google Drive connection found. Please connect your Google Drive account first.",
        },
      });
    }

    const connectionId = connectionResult.value.connectionId;
    if (!connectionId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message:
            "No Google Drive connection found. Please connect your Google Drive account first.",
        },
      });
    }

    // Get the access token for this connection
    const tokenResult = await getOAuthConnectionAccessToken({
      config: config.getOAuthAPIConfig(),
      logger,
      connectionId,
    });

    if (tokenResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to get access token",
        },
      });
    }

    const clientId = config.getOAuthGoogleDriveClientId();
    const developerKey = config.getGoogleDrivePickerApiKey();

    // Extract appId (project number) from clientId
    // clientId format: "PROJECT_NUMBER.apps.googleusercontent.com" or "PROJECT_NUMBER-xxx.apps.googleusercontent.com"
    const appIdMatch = clientId.match(/^(\d+)/);
    if (!appIdMatch) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to extract app ID from client ID",
        },
      });
    }
    const appId = appIdMatch[1];

    return ctx.json({
      accessToken: tokenResult.value.access_token,
      clientId,
      developerKey,
      appId,
    });
  }
);

export default app;
