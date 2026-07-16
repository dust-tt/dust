import apiConfig from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function setWorkspaceGitHubConnection(
  auth: Authenticator,
  { connectionId }: { connectionId: string }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const connectedBy = auth.user()?.sId;
  if (!connectedBy) {
    return new Err(new Error("A user is required to connect GitHub."));
  }

  const ownershipRes = await checkConnectionOwnership(auth, connectionId);
  if (ownershipRes.isErr()) {
    return new Err(new Error("The GitHub connection is invalid."));
  }

  const oauthAPI = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
  const metadataRes = await oauthAPI.getConnectionMetadata({ connectionId });
  if (
    metadataRes.isErr() ||
    metadataRes.value.connection.provider !== "github"
  ) {
    return new Err(new Error("The GitHub connection is invalid."));
  }

  const updateRes = await updateWorkspaceMetadata(owner, {
    skillImportGithubConnection: { connectionId, connectedBy },
  });
  if (updateRes.isErr()) {
    return new Err(new Error("Failed to save the GitHub connection."));
  }

  return new Ok(undefined);
}
