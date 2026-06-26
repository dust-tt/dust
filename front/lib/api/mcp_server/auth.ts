import config from "@app/lib/api/config";
import {
  areRedirectUrisAllowed,
  getDustMcpServerAllowedRedirectUris,
  getDustMcpServerRedirectUriPolicy,
  isDustMcpServerEnabled,
} from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import {
  getMcpResourceMetadataUrl,
  getMcpResourceServerUrl,
  getWorkOSAuthKitDomain,
  normalizeOAuthUrl,
} from "@app/lib/api/mcp_server/urls";
import { getWorkOSConnectApplication } from "@app/lib/api/workos";
import {
  getAuthenticatorFromWorkOSClaims,
  type WorkOSWorkspaceAuthenticator,
} from "@app/lib/api/workos_authenticator";
import logger from "@app/logger/logger";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
  createRemoteJWKSet,
  decodeJwt,
  type JWTPayload,
  jwtVerify,
} from "jose";

export type McpServerAuthVariables = {
  mcpAuth: WorkOSWorkspaceAuthenticator;
};

const WORKOS_AUTHKIT_DOMAIN = getWorkOSAuthKitDomain();
const DUST_MCP_SERVER_URL = getMcpResourceServerUrl();
const resourceMetadataUrl = getMcpResourceMetadataUrl(DUST_MCP_SERVER_URL);

// WorkOS Connect MCP access tokens — see https://workos.com/docs/authkit/mcp
const JWKS = createRemoteJWKSet(
  new URL(`${WORKOS_AUTHKIT_DOMAIN}/oauth2/jwks`)
);

function extractBearerToken(authHeader: string | undefined): string | null {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function isJwtFormat(token: string): boolean {
  return token.split(".").length === 3;
}

function tokenAudienceMatchesResource(
  aud: JWTPayload["aud"],
  expectedResource: string
): boolean {
  const audiences =
    aud === undefined ? [] : Array.isArray(aud) ? aud : [String(aud)];
  return audiences.some(
    (value) => normalizeOAuthUrl(String(value)) === expectedResource
  );
}

function forbiddenResponse(
  c: Context,
  {
    error = "forbidden",
    description = "Access denied",
  }: { error?: string; description?: string } = {}
) {
  return c.json({ error, error_description: description }, 403);
}

/** RFC 9728 challenge — must be present on every 401 so MCP clients start OAuth. */
function unauthorizedResponse(
  c: Context,
  {
    error = "unauthorized",
    description = "Authorization needed",
  }: { error?: string; description?: string } = {}
) {
  return c.json({ error }, 401, {
    "WWW-Authenticate": [
      `Bearer error="${error}"`,
      `error_description="${description}"`,
      `resource_metadata="${resourceMetadataUrl}"`,
    ].join(", "),
  });
}

export const mcpServerAuthMiddleware = createMiddleware<{
  Variables: McpServerAuthVariables;
}>(async (c, next) => {
  const token = extractBearerToken(c.req.header("Authorization"));

  if (!token) {
    return unauthorizedResponse(c);
  }

  if (!isJwtFormat(token)) {
    logger.warn(
      {
        tokenLength: token.length,
        looksLikeInspectorProxyToken: /^[0-9a-f]{64}$/i.test(token),
      },
      "[dust-mcp-server] Bearer token is not a JWT — returning 401 challenge so the client can start OAuth. If using MCP Inspector: disable any custom Authorization header in the sidebar and clear stored OAuth tokens for this server URL."
    );
    return unauthorizedResponse(c, {
      error: "invalid_token",
      description: "Access token is not a valid WorkOS JWT",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      clockTolerance: 30,
    });

    if (normalizeOAuthUrl(String(payload.iss)) !== WORKOS_AUTHKIT_DOMAIN) {
      throw new Error("Token issuer does not match WorkOS AuthKit domain");
    }

    if (!payload.sub) {
      throw new Error("Token missing sub claim");
    }

    if (!tokenAudienceMatchesResource(payload.aud, DUST_MCP_SERVER_URL)) {
      logger.info(
        { aud: payload.aud },
        "Token audience does not match MCP resource URL, falling back to application:client_id claim"
      );

      const clientId = payload["application:client_id"];
      if (typeof clientId !== "string" || !clientId.trim()) {
        throw new Error(
          "Access token with mismatched audience: missing application:client_id claim"
        );
      }

      const applicationResult = await getWorkOSConnectApplication(
        clientId.trim()
      );
      if (applicationResult.isErr()) {
        throw new Error(
          "Access token with mismatched audience: failed to fetch WorkOS Connect application"
        );
      }

      const application = applicationResult.value;
      if (application.application_type !== "oauth") {
        throw new Error("Connect application is not an OAuth application");
      }

      // Check if it's a dynamically registered application and that the token audience matches workOSClientID.
      // And check that application client id is not workOSClientID.
      // This doesn't prove that the token is for the mcp resource but at least we know it's a connect application.
      if (
        !application.was_dynamically_registered ||
        payload.aud !== config.getWorkOSClientId() ||
        application.client_id === config.getWorkOSClientId()
      ) {
        throw new Error(
          "Access token with mismatched audience: invalid application"
        );
      }
    }

    const authResult = await getAuthenticatorFromWorkOSClaims(payload);
    if (authResult.isErr()) {
      const descriptions: Record<typeof authResult.error, string> = {
        organization_missing:
          "Access token is missing a WorkOS organization (org_id claim)",
        workspace_not_found:
          "Access token organization does not match a Dust workspace",
        user_not_found: "Dust user not found for access token",
        not_a_member: "User is not a member of the selected workspace",
        invalid_token_payload: "Access token payload is invalid",
      };

      logger.warn(
        {
          error: authResult.error,
          tokenClaims: {
            sub: payload.sub,
            org_id: payload.org_id,
          },
        },
        "[dust-mcp-server] Failed to build workspace-scoped authenticator"
      );

      return unauthorizedResponse(c, {
        error: "invalid_token",
        description: descriptions[authResult.error],
      });
    }

    const authenticator = authResult.value.authenticator;
    const workspace = authenticator.workspace();
    const workspaceMetadata = workspace.metadata;

    if (!isDustMcpServerEnabled(workspaceMetadata)) {
      logger.warn(
        { workspaceId: workspace.sId },
        "[dust-mcp-server] MCP server is disabled for workspace"
      );
      return forbiddenResponse(c, {
        description: "MCP server is disabled for this workspace",
      });
    }

    if (getDustMcpServerRedirectUriPolicy(workspaceMetadata) === "allowlist") {
      const clientId = payload["application:client_id"];
      if (typeof clientId !== "string" || !clientId.trim()) {
        logger.warn(
          { workspaceId: workspace.sId },
          "[dust-mcp-server] Access token missing application:client_id claim"
        );
        return forbiddenResponse(c, {
          description:
            "Access token is missing Connect application information",
        });
      }

      const applicationResult = await getWorkOSConnectApplication(
        clientId.trim()
      );
      if (applicationResult.isErr()) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            clientId: clientId.trim(),
            err: applicationResult.error,
          },
          "[dust-mcp-server] Failed to fetch WorkOS Connect application"
        );
        return forbiddenResponse(c, {
          description: "Failed to validate Connect application redirect URIs",
        });
      }

      const application = applicationResult.value;
      const redirectUris =
        application.application_type === "oauth"
          ? application.redirect_uris.map(({ uri }) => uri)
          : [];

      const allowedPatterns =
        getDustMcpServerAllowedRedirectUris(workspaceMetadata);
      if (!areRedirectUrisAllowed(redirectUris, allowedPatterns)) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            clientId: clientId.trim(),
            redirectUris,
            allowedPatterns,
          },
          "[dust-mcp-server] Connect application redirect URIs are not allowed"
        );
        return forbiddenResponse(c, {
          description:
            "Connect application redirect URIs are not allowed for this workspace",
        });
      }
    }

    c.set("mcpAuth", authenticator);
    await next();
  } catch (err) {
    let decoded: JWTPayload | undefined;
    try {
      decoded = decodeJwt(token);
    } catch {
      // Ignore decode errors; log the verification error below.
    }

    logger.warn(
      {
        err,
        tokenClaims: decoded
          ? {
              iss: decoded.iss,
              aud: decoded.aud,
              sub: decoded.sub,
              org_id: decoded.org_id,
            }
          : undefined,
        expected: {
          issuer: WORKOS_AUTHKIT_DOMAIN,
          audience: DUST_MCP_SERVER_URL,
        },
      },
      "[dust-mcp-server] Token validation failed"
    );

    return unauthorizedResponse(c, {
      error: "invalid_token",
      description: "Access token validation failed",
    });
  }
});
