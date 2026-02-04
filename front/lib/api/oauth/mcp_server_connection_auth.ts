import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export type MCPServerConnectionAuthMode = "oauth" | "credentials" | "any";

export type MCPServerConnectionAuthRef =
  | { authType: "oauth"; connectionId: string }
  | { authType: "credentials"; credentialId: string };

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
      kind: "credentials_not_configured";
      message: string;
    }
  | {
      kind: "invalid_connection";
      message: string;
    };

export async function getWorkspaceMCPServerAuthRef(
  auth: Authenticator,
  mcpServerId: string,
  {
    mode,
  }: {
    mode: MCPServerConnectionAuthMode;
  }
): Promise<Result<MCPServerConnectionAuthRef, WorkspaceMCPServerAuthRefError>> {
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

  const hasOAuth =
    typeof connectionRes.value.connectionId === "string" &&
    connectionRes.value.connectionId !== "";
  const hasCredentials =
    typeof connectionRes.value.credentialId === "string" &&
    connectionRes.value.credentialId !== "";

  if (!hasOAuth && !hasCredentials) {
    return new Err({
      kind: "invalid_connection",
      message: "MCP server connection is invalid: missing auth reference.",
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  if (mode === "oauth") {
    if (!hasOAuth) {
      return new Err({
        kind: "oauth_not_configured",
        message: "Workspace MCP server connection is not configured for OAuth.",
      } satisfies WorkspaceMCPServerAuthRefError);
    }
    return new Ok({
      authType: "oauth",
      connectionId: connectionRes.value.connectionId!,
    });
  }

  if (mode === "credentials") {
    if (!hasCredentials) {
      return new Err({
        kind: "credentials_not_configured",
        message:
          "Workspace MCP server connection is not configured for credentials.",
      } satisfies WorkspaceMCPServerAuthRefError);
    }
    return new Ok({
      authType: "credentials",
      credentialId: connectionRes.value.credentialId!,
    });
  }

  // mode === "any"
  if (hasOAuth) {
    return new Ok({
      authType: "oauth",
      connectionId: connectionRes.value.connectionId!,
    });
  }

  return new Ok({
    authType: "credentials",
    credentialId: connectionRes.value.credentialId!,
  });
}

export async function getWorkspaceOAuthConnectionIdForMCPServer(
  auth: Authenticator,
  mcpServerId: string
): Promise<Result<string, WorkspaceMCPServerAuthRefError>> {
  const authRefRes = await getWorkspaceMCPServerAuthRef(auth, mcpServerId, {
    mode: "oauth",
  });
  if (authRefRes.isErr()) {
    return authRefRes;
  }
  return new Ok(authRefRes.value.connectionId);
}
