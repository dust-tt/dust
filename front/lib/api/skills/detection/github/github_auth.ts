import apiConfig from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";

export async function getWorkspaceLevelGitHubAccessToken(
  auth: Authenticator
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();

  const workspace = await WorkspaceResource.fetchById(owner.sId);
  const connection = workspace?.getSkillImportGitHubConnection();
  if (!connection) {
    return null;
  }

  const tokenResult = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    connectionId: connection.connectionId,
  });
  if (tokenResult.isOk()) {
    return tokenResult.value.access_token;
  }

  logger.warn(
    {
      workspaceId: owner.sId,
      error: tokenResult.error,
    },
    "Failed to get GitHub access token from existing connection."
  );

  return null;
}
