import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import apiConfig from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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

  void emitAuditLogEvent({
    auth,
    action: "skill_import_github_connection.created",
    targets: [buildAuditLogTarget("workspace", owner)],
    context: getAuditLogContext(auth),
    metadata: { connected_by: connectedBy },
  });

  return new Ok(undefined);
}

export async function deleteWorkspaceGitHubConnection(
  auth: Authenticator
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const workspace = await WorkspaceResource.fetchById(owner.sId);
  if (!workspace) {
    return new Err(new Error("Workspace not found."));
  }

  const updateRes = await workspace.removeMetadataKeys([
    "skillImportGithubConnection",
  ]);
  if (updateRes.isErr()) {
    return new Err(new Error("Failed to disconnect GitHub."));
  }

  void emitAuditLogEvent({
    auth,
    action: "skill_import_github_connection.deleted",
    targets: [buildAuditLogTarget("workspace", owner)],
    context: getAuditLogContext(auth),
  });

  return new Ok(undefined);
}
