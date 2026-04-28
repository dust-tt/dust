import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import { getProviderStrategy } from "@app/lib/api/oauth";
import type { OAuthProvider } from "@app/types/oauth/lib";

export function oauthProviderRequiresWorkspaceConnectionForPersonalAuth(
  provider: OAuthProvider
): boolean {
  return (
    getProviderStrategy(provider).requiresWorkspaceConnectionForPersonalAuth ===
    true
  );
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
