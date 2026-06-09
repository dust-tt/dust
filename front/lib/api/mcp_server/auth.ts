import {
  getAuthenticatorFromWorkOSClaims,
  type McpAuthenticator,
} from "@app/lib/api/mcp_server/authenticator";
import {
  getMcpResourceMetadataUrl,
  getMcpResourceServerUrl,
  getWorkOSAuthKitDomain,
  normalizeOAuthUrl,
} from "@app/lib/api/mcp_server/urls";
import logger from "@app/logger/logger";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
  createRemoteJWKSet,
  decodeJwt,
  type JWTPayload,
  jwtVerify,
} from "jose";

export type McpServerAuthUser = JWTPayload & { sub: string };

export type McpServerAuthVariables = {
  mcpUser: McpServerAuthUser;
  mcpAuthInfo: AuthInfo;
  mcpAuth: McpAuthenticator;
};

function tokenScopes(payload: JWTPayload): string[] {
  const { scope } = payload;
  if (typeof scope === "string" && scope.trim()) {
    return scope.split(" ").filter(Boolean);
  }
  return [];
}

function toMcpAuthInfo(token: string, payload: McpServerAuthUser): AuthInfo {
  return {
    token,
    clientId: payload.sub,
    scopes: tokenScopes(payload),
    expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    extra: { user: payload },
  };
}

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
      throw new Error("Token audience does not match MCP resource URL");
    }

    const mcpUser = payload as McpServerAuthUser;
    const authResult = await getAuthenticatorFromWorkOSClaims(mcpUser);
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
            sub: mcpUser.sub,
            org_id: mcpUser.org_id,
          },
        },
        "[dust-mcp-server] Failed to build workspace-scoped authenticator"
      );

      return unauthorizedResponse(c, {
        error: "invalid_token",
        description: descriptions[authResult.error],
      });
    }

    c.set("mcpUser", mcpUser);
    c.set("mcpAuthInfo", toMcpAuthInfo(token, mcpUser));
    c.set("mcpAuth", authResult.value);
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
