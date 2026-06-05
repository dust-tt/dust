import {
  getMcpProtectedResourcePath,
  getMcpResourceServerUrl,
  getWorkOSAuthKitDomain,
} from "@app/lib/api/mcp_server/urls";
import { createHono } from "@front-api/lib/hono";

const WORKOS_AUTHKIT_DOMAIN = getWorkOSAuthKitDomain();
const DUST_MCP_SERVER_URL = getMcpResourceServerUrl();
const protectedResourcePath = getMcpProtectedResourcePath(DUST_MCP_SERVER_URL);
const authorizationServerMetadataUrl = new URL(
  "/.well-known/oauth-authorization-server",
  WORKOS_AUTHKIT_DOMAIN
);

const protectedResourceMetadata = {
  resource: DUST_MCP_SERVER_URL,
  authorization_servers: [WORKOS_AUTHKIT_DOMAIN],
  bearer_methods_supported: ["header"],
} as const;

export const mcpWellKnownApp = createHono();

function serveProtectedResourceMetadata(c: {
  json: (body: unknown) => Response;
}) {
  return c.json(protectedResourceMetadata);
}

async function serveAuthorizationServerMetadata(c: {
  json: (body: unknown, status?: number) => Response;
}) {
  const response = await fetch(authorizationServerMetadataUrl);
  const metadata = await response.json();

  if (!response.ok) {
    return c.json(metadata, response.status);
  }

  return c.json(metadata);
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
