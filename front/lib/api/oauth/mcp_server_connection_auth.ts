import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";
import type { OAuthAPIError } from "@app/types/oauth/oauth_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

export type WorkspaceMCPServerAuthRefError =
  | {
      kind: "connection_not_found";
      message: string;
    }
  | {
      kind: "oauth_not_configured";
      message: string;
    }
  | {
      kind: "invalid_connection";
      message: string;
    };

export type WorkspaceOAuthConnectionLookupError =
  | WorkspaceMCPServerAuthRefError
  | {
      kind: "oauth_metadata_failed";
      message: string;
      oAuthAPIError?: OAuthAPIError;
    };

export async function getWorkspaceOAuthConnectionIdForMCPServer(
  auth: Authenticator,
  mcpServerId: string
): Promise<Result<string, WorkspaceMCPServerAuthRefError>> {
  const connectionRes = await MCPServerConnectionResource.findByMCPServer(
    auth,
    {
      mcpServerId,
      connectionType: "workspace",
    }
  );

  if (connectionRes.isErr()) {
    return new Err({
      kind: "connection_not_found",
      message:
        "Failed to find MCP server connection: " + connectionRes.error.message,
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  const hasAnyAuthRef =
    (isString(connectionRes.value.connectionId) &&
      connectionRes.value.connectionId !== "") ||
    (isString(connectionRes.value.credentialId) &&
      connectionRes.value.credentialId !== "");

  if (!hasAnyAuthRef) {
    return new Err({
      kind: "invalid_connection",
      message: "MCP server connection is invalid: missing auth reference.",
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  const connectionId = connectionRes.value.connectionId;
  if (!isString(connectionId) || connectionId === "") {
    return new Err({
      kind: "oauth_not_configured",
      message: "Workspace MCP server connection is not configured for OAuth.",
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  return new Ok(connectionId);
}

/**
 * Load the workspace OAuth connection for an MCP server (metadata + redirect).
 * Uses getConnectionMetadata (not getAccessToken) so Refresh works when the
 * stored access token is expired — credentials and endpoints live on the
 * connection even after the token dies.
 */
export async function getWorkspaceOAuthConnectionForMCPServer(
  auth: Authenticator,
  mcpServerId: string
): Promise<Result<OAuthConnectionType, WorkspaceOAuthConnectionLookupError>> {
  const oauthConnectionIdRes = await getWorkspaceOAuthConnectionIdForMCPServer(
    auth,
    mcpServerId
  );
  if (oauthConnectionIdRes.isErr()) {
    return new Err(oauthConnectionIdRes.error);
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const connectionRes = await oauthApi.getConnectionMetadata({
    connectionId: oauthConnectionIdRes.value,
  });
  if (connectionRes.isErr()) {
    return new Err({
      kind: "oauth_metadata_failed",
      message:
        "Failed to get connection metadata: " + connectionRes.error.message,
      oAuthAPIError: connectionRes.error,
    });
  }

  return new Ok(connectionRes.value.connection);
}

/**
 * Platform Connect may pass mcp_server_id before a workspace connection exists
 * (first connect). Only that absence is safe to fall through to caller
 * credentials — Refresh and other lookup failures must not silently use a
 * caller-supplied client_id with reused workspace secrets.
 */
export function shouldFallThroughPlatformWorkspaceReuse({
  useCase,
  error,
}: {
  useCase: OAuthUseCase;
  error: WorkspaceOAuthConnectionLookupError;
}): boolean {
  return (
    useCase === "platform_actions" && error.kind === "connection_not_found"
  );
}

// Verify that the workspace-level OAuth connection for this MCP server exists and still
// references a live connection in the OAuth service. The front row can reference a connection
// the OAuth service no longer has (front tables are copied verbatim during workspace relocation
// while OAuth service data is regional, among other orphaning scenarios) — the OAuth service
// then returns `connection_not_found`. Only the two states demonstrated by broken references
// are converted to a user-facing error: a missing row and a dangling connectionId. Everything
// else — transient OAuth service failures, but also unexpected states like a credential-backed
// connection on a personal OAuth attempt — deliberately passes the check: callers proceed and
// surface those as internal errors to investigate rather than as admin configuration advice.
// Error messages are user-facing: callers return them to the client as-is.
export async function verifyWorkspaceOAuthConnectionForMCPServer(
  auth: Authenticator,
  mcpServerId: string
): Promise<Result<undefined, WorkspaceMCPServerAuthRefError>> {
  const connectionIdRes = await getWorkspaceOAuthConnectionIdForMCPServer(
    auth,
    mcpServerId
  );
  if (connectionIdRes.isErr()) {
    if (connectionIdRes.error.kind !== "connection_not_found") {
      return new Ok(undefined);
    }
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        mcpServerId,
        kind: connectionIdRes.error.kind,
        error: connectionIdRes.error.message,
      },
      "OAuth: workspace connection lookup failed during preflight"
    );
    return new Err({
      kind: "connection_not_found",
      message:
        "This tool has no workspace-level connection. Ask a workspace admin to connect the " +
        "tool before setting up your personal connection.",
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const metadataRes = await oauthApi.getConnectionMetadata({
    connectionId: connectionIdRes.value,
  });
  if (
    metadataRes.isErr() &&
    metadataRes.error.code === "connection_not_found"
  ) {
    return new Err({
      kind: "connection_not_found",
      message:
        "This tool's workspace connection no longer exists. Ask a workspace admin to " +
        "reconnect the tool before setting up your personal connection.",
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  return new Ok(undefined);
}
