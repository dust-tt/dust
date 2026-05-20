import { getDefaultRemoteMCPServerByURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import { MCPOAuthProvider } from "@app/lib/actions/mcp_oauth_provider";
import type { MCPOAuthConnectionMetadataType } from "@app/lib/api/oauth/providers/mcp";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { headersArrayToRecord } from "@app/types/shared/utils/http_headers";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type DiscoverOAuthMetadataResponseBody =
  | {
      oauthRequired: true;
      connectionMetadata: MCPOAuthConnectionMetadataType;
    }
  | {
      oauthRequired: false;
    };

const PostBodySchema = z.object({
  url: z.string(),
  customHeaders: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
});

// Mounted at /api/w/:wId/mcp/discover_oauth_metadata.
const app = new Hono();

// Discovers OAuth metadata for a remote MCP server. Checks if the server
// requires OAuth; if so, returns the connection metadata for the client to
// drive the oauth flow. Otherwise responds with oauthRequired: false.
//
// Note: callers should not invoke this frequently — the remote server is
// likely to rate-limit.
app.post("/", validate("json", PostBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { url, customHeaders } = ctx.req.valid("json");

  try {
    new URL(url);
  } catch {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid URL format. Please provide a valid URL.",
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
});

export default app;
