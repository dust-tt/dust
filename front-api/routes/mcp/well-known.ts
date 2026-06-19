import { sanitizeOAuthRegistrationRequestBody } from "@app/lib/api/mcp_server/oauth_registration";
import {
  getMcpAuthorizationServers,
  getMcpAuthorizationServerUrl,
  getMcpProtectedResourcePath,
  getMcpResourceServerUrl,
  getWorkOSAuthKitDomain,
  getWorkOSAuthKitOAuthRegistrationUrl,
  getWorkOSAuthKitOAuthTokenUrl,
  shouldUseProxy,
} from "@app/lib/api/mcp_server/urls";
import { createHono } from "@front-api/lib/hono";
import type { Context } from "hono";

const WORKOS_AUTHKIT_DOMAIN = getWorkOSAuthKitDomain();
const DUST_MCP_SERVER_URL = getMcpResourceServerUrl();
const protectedResourcePath = getMcpProtectedResourcePath(DUST_MCP_SERVER_URL);
const authorizationServerMetadataUrl = new URL(
  "/.well-known/oauth-authorization-server",
  WORKOS_AUTHKIT_DOMAIN
);

function getProtectedResourceMetadata() {
  return {
    resource: DUST_MCP_SERVER_URL,
    authorization_servers: getMcpAuthorizationServers(),
    bearer_methods_supported: ["header"],
  } as const;
}

export const mcpWellKnownApp = createHono();

function serveProtectedResourceMetadata(c: {
  json: (body: unknown) => Response;
}) {
  return c.json(getProtectedResourceMetadata());
}

type OAuthAuthorizationServerMetadata = {
  token_endpoint?: string;
  registration_endpoint?: string;
  [key: string]: unknown;
};

function rewriteAuthorizationServerMetadataForBrowserClients(
  metadata: OAuthAuthorizationServerMetadata
): OAuthAuthorizationServerMetadata {
  const mcpAuthorizationServerUrl = getMcpAuthorizationServerUrl();
  return {
    ...metadata,
    token_endpoint: `${mcpAuthorizationServerUrl}/oauth2/token`,
    ...(metadata.registration_endpoint
      ? {
          registration_endpoint: `${mcpAuthorizationServerUrl}/oauth2/register`,
        }
      : {}),
  };
}

async function serveAuthorizationServerMetadata(c: {
  json: (body: unknown, status?: number) => Response;
}) {
  const response = await fetch(authorizationServerMetadataUrl);
  const metadata = (await response.json()) as OAuthAuthorizationServerMetadata;

  if (!response.ok) {
    return c.json(metadata, response.status);
  }

  if (!shouldUseProxy()) {
    return c.json(metadata);
  }

  return c.json(rewriteAuthorizationServerMetadataForBrowserClients(metadata));
}

async function proxyOAuthPostRequest(
  c: Context,
  upstreamUrl: string
): Promise<Response> {
  const headers = new Headers();
  const contentType = c.req.header("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const accept = c.req.header("accept");
  if (accept) {
    headers.set("accept", accept);
  }

  const body = sanitizeOAuthRegistrationRequestBody(await c.req.text());

  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    body,
  });

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  if (responseContentType) {
    responseHeaders.set("content-type", responseContentType);
  }

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: responseHeaders,
  });
}

// Path-aware discovery for → /.well-known/oauth-protected-resource/mcp
mcpWellKnownApp.get(protectedResourcePath, serveProtectedResourceMetadata);

// RFC 9728 root fallback used by some clients and WorkOS docs examples.
mcpWellKnownApp.get(
  "/.well-known/oauth-protected-resource",
  serveProtectedResourceMetadata
);

// Compatibility fallback for clients that look for Authorization Server
// Metadata on the MCP host instead of following the protected resource metadata.
mcpWellKnownApp.get(
  "/.well-known/oauth-authorization-server",
  serveAuthorizationServerMetadata
);

// Browser MCP clients in local dev exchange authorization codes via fetch;
// proxy token/registration endpoints so CORS is handled by Dust instead of AuthKit.
if (shouldUseProxy()) {
  mcpWellKnownApp.post("/oauth2/token", async (c) =>
    proxyOAuthPostRequest(c, getWorkOSAuthKitOAuthTokenUrl())
  );

  mcpWellKnownApp.post("/oauth2/register", async (c) =>
    proxyOAuthPostRequest(c, getWorkOSAuthKitOAuthRegistrationUrl())
  );
}
