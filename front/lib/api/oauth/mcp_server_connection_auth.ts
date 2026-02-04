import type { OAuthError } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export type MCPServerConnectionAuthMode = "oauth" | "credentials" | "any";

export type MCPServerConnectionAuthRef =
  | { authType: "oauth"; connectionId: string }
  | { authType: "credentials"; credentialId: string };

function toCredentialRetrievalError(message: string) {
  return {
    code: "credential_retrieval_failed" as const,
    message,
  } satisfies OAuthError;
}

export async function getWorkspaceMCPServerAuthRef(
  auth: Authenticator,
  mcpServerId: string,
  {
    mode,
    oauthNotConfiguredMessage,
    credentialsNotConfiguredMessage,
  }: {
    mode: MCPServerConnectionAuthMode;
    oauthNotConfiguredMessage?: string;
    credentialsNotConfiguredMessage?: string;
  }
): Promise<Result<MCPServerConnectionAuthRef, OAuthError>> {
  const connectionRes = await MCPServerConnectionResource.findByMCPServer(
    auth,
    {
      mcpServerId,
      connectionType: "workspace",
    }
  );

  if (connectionRes.isErr()) {
    return new Err(
      toCredentialRetrievalError(
        "Failed to find MCP server connection: " + connectionRes.error.message
      )
    );
  }

  const hasOAuth =
    typeof connectionRes.value.connectionId === "string" &&
    connectionRes.value.connectionId !== "";
  const hasCredentials =
    typeof connectionRes.value.credentialId === "string" &&
    connectionRes.value.credentialId !== "";

  if (!hasOAuth && !hasCredentials) {
    return new Err(
      toCredentialRetrievalError(
        "MCP server connection is invalid: missing auth reference."
      )
    );
  }

  if (mode === "oauth") {
    if (!hasOAuth) {
      return new Err(
        toCredentialRetrievalError(
          oauthNotConfiguredMessage ??
            "Workspace MCP server connection is not configured for OAuth."
        )
      );
    }
    return new Ok({
      authType: "oauth",
      connectionId: connectionRes.value.connectionId!,
    });
  }

  if (mode === "credentials") {
    if (!hasCredentials) {
      return new Err(
        toCredentialRetrievalError(
          credentialsNotConfiguredMessage ??
            "Workspace MCP server connection is not configured for credentials."
        )
      );
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
  mcpServerId: string,
  {
    oauthNotConfiguredMessage,
  }: {
    oauthNotConfiguredMessage?: string;
  } = {}
): Promise<Result<string, OAuthError>> {
  const authRefRes = await getWorkspaceMCPServerAuthRef(auth, mcpServerId, {
    mode: "oauth",
    oauthNotConfiguredMessage,
  });
  if (authRefRes.isErr()) {
    return authRefRes;
  }
  return new Ok(authRefRes.value.connectionId);
}
