import { getDefaultRemoteMCPServerByURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import { MCPOAuthProvider } from "@app/lib/actions/mcp_oauth_provider";
import { validateExternalUrl } from "@app/lib/api/url_safety";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { DiscoverOAuthMetadataResponseBody } from "@app/types/api/oauth/providers/mcp";
import { headersArrayToRecord } from "@app/types/shared/utils/http_headers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostBodySchema = z.object({
  url: z.string(),
  customHeaders: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
});

// Mounted at /api/w/:wId/mcp/discover_oauth_metadata.
const app = workspaceApp();

// Discovers OAuth metadata for a remote MCP server. Checks if the server
// requires OAuth; if so, returns the connection metadata for the client to
// drive the oauth flow. Otherwise responds with oauthRequired: false.
//
// Note: callers should not invoke this frequently — the remote server is
// likely to rate-limit.
/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostBodySchema),
  async (ctx): HandlerResult<DiscoverOAuthMetadataResponseBody> => {
    const auth = ctx.get("auth");
    const { url, customHeaders } = ctx.req.valid("json");

    const urlError = await validateExternalUrl(url);
    if (urlError) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: urlError,
        },
      });
    }

    const headers = headersArrayToRecord(customHeaders);

    // Try a direct connection without auth first.
    const directConnectRes = await connectToMCPServer(auth, {
      params: {
        type: "remoteMCPServerUrl",
        remoteMCPServerUrl: url,
        headers,
      },
    });

    if (directConnectRes.isOk()) {
      return ctx.json({ oauthRequired: false });
    }

    // Direct connect failed — try discovery.
    const defaultServerConfig = getDefaultRemoteMCPServerByURL(url);
    const extraScopes = defaultServerConfig?.scope;

    const discoveryRes = await RemoteMCPServerResource.discoverOAuthMetadata({
      serverUrl: url,
      provider: new MCPOAuthProvider(),
      customHeaders: headers,
      extraScopes,
    });

    if (discoveryRes.isOk()) {
      return ctx.json({
        oauthRequired: true,
        connectionMetadata: discoveryRes.value,
      });
    }

    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: discoveryRes.error.message,
      },
    });
  }
);

export default app;
