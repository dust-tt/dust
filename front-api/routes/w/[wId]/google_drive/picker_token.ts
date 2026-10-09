import {
  isValidInternalMCPServerId,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import config from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import type { PickerTokenResponseType } from "@app/types/api/google_drive";
import type { ModelId } from "@app/types/shared/model_id";
import {
  type WorkspaceAwareCtx,
  workspaceApp,
} from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const RequestBodySchema = z.object({
  // Internal MCP server sId of a Google Drive server in this workspace.
  mcpServerId: z.string().min(1, "mcpServerId is required"),
});

// The picker runs in the browser and needs this server's OAuth access token.
// The route must not exchange a connection for any other MCP server.
function isWorkspaceGoogleDriveServer(
  workspaceModelId: ModelId,
  mcpServerId: string
): boolean {
  return (
    isValidInternalMCPServerId(workspaceModelId, mcpServerId) &&
    matchesInternalMCPServerName(mcpServerId, "google_drive")
  );
}

type PickerTokenBody = z.infer<typeof RequestBodySchema>;

/**
 * @cc [owner:frankaloia,label:security] picker-token-google-drive-only
 * `mcpServerId` MUST be an internal `google_drive` server whose sId encodes
 * the caller's workspace. Any other id MUST be rejected with HTTP 400, and
 * `getOAuthConnectionAccessToken` MUST NOT be called.
 */
/**
 * @cc [owner:frankaloia,label:security] picker-token-accessible-connection
 * The OAuth connection MUST be chosen from views the caller can `read` or
 * `admin`. If none exist, the handler MUST return HTTP 404 and MUST NOT call
 * `getOAuthConnectionAccessToken`. `connectionType` MUST be `workspace` only
 * when one of those views has `oAuthUseCase` `platform_actions`; otherwise it
 * MUST be `personal`.
 */
async function postPickerToken(
  ctx: Context<
    WorkspaceAwareCtx,
    "/",
    { in: { json: PickerTokenBody }; out: { json: PickerTokenBody } }
  >
): HandlerResult<PickerTokenResponseType> {
  const auth = ctx.get("auth");
  const { mcpServerId } = ctx.req.valid("json");

  if (
    !isWorkspaceGoogleDriveServer(
      auth.getNonNullableWorkspace().id,
      mcpServerId
    )
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "mcpServerId must be a Google Drive server in this workspace.",
      },
    });
  }

  const views = await MCPServerViewResource.listByMCPServer(auth, mcpServerId, {
    mode: "metadata",
  });
  // listByMCPServer is only workspace-scoped. Drop views in spaces the caller
  // cannot read (including the system-space view) so an inaccessible
  // platform_actions configuration cannot select the admin connection.
  const accessibleViews = views.filter(
    (view) => auth.can("read", view) || auth.can("admin", view)
  );
  if (accessibleViews.length === 0) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message:
          "No Google Drive connection found. Please connect your Google Drive account first.",
      },
    });
  }

  // Use whichever connection type an accessible view is configured for.
  const connectionType = accessibleViews.some(
    (view) => view.oAuthUseCase === "platform_actions"
  )
    ? "workspace"
    : "personal";

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

// Mounted at /api/w/:wId/google_drive/picker_token.
const app = workspaceApp();

/** @ignoreswagger */
app.post("/", validate("json", RequestBodySchema), postPickerToken);

export default app;
