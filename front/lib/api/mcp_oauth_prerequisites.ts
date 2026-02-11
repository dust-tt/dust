import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import { getProviderStrategy } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { OAuthProvider } from "@app/types/oauth/lib";

export function oauthProviderRequiresWorkspaceConnectionForPersonalAuth(
  provider: OAuthProvider
): boolean {
  return (
    getProviderStrategy(provider).requiresWorkspaceConnectionForPersonalAuth ===
    true
  );
}

export async function listWorkspaceConnectedMCPServerIds(
  auth: Authenticator
): Promise<Set<string>> {
  const workspaceConnections =
    await MCPServerConnectionResource.listByWorkspace(auth, {
      connectionType: "workspace",
    });

  const workspaceId = auth.getNonNullableWorkspace().id;
  const serverIds = new Set<string>();

  for (const connection of workspaceConnections) {
    if (connection.internalMCPServerId) {
      serverIds.add(connection.internalMCPServerId);
      continue;
    }

    if (connection.remoteMCPServerId) {
      serverIds.add(
        remoteMCPServerNameToSId({
          remoteMCPServerId: connection.remoteMCPServerId,
          workspaceId,
        })
      );
    }
  }

  return serverIds;
}

export function withWorkspaceConnectionRequirement(
  authorization: AuthorizationInfo | null,
  {
    isWorkspaceConnected,
  }: {
    isWorkspaceConnected: boolean;
  }
): AuthorizationInfo | null {
  if (!authorization) {
    return null;
  }

  if (
    !oauthProviderRequiresWorkspaceConnectionForPersonalAuth(
      authorization.provider
    )
  ) {
    return authorization;
  }

  return {
    ...authorization,
    workspace_connection: {
      required: true,
      satisfied: isWorkspaceConnected,
    },
  };
}
