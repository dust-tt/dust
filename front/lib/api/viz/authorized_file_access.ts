import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { legacyScopedPathsMatch } from "@app/lib/api/files/mount_path";
import { isAuthorizedFileRef } from "@app/lib/api/viz/authorized_file_access_policy";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { AuthorizedFileAccessAllowlist } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";

export async function reverifyAuthorAccess(
  authorizedFileAccess: AuthorizedFileAccessAllowlist,
  requestedRef: string,
  workspace: LightWorkspaceType
): Promise<boolean> {
  if (!isAuthorizedFileRef(authorizedFileAccess, requestedRef)) {
    return false;
  }

  const userId = authorizedFileAccess.computedByUserId;

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspace.sId
  );

  const matchingRef = authorizedFileAccess.refs.find((r) => {
    if (r.kind === "file_id") {
      return r.ref === requestedRef;
    }
    return (
      r.ref === requestedRef ||
      legacyScopedPathsMatch(r.legacyPath, requestedRef)
    );
  });

  if (!matchingRef) {
    return false;
  }

  if (matchingRef.kind === "file_id") {
    const file = await FileResource.fetchById(auth, matchingRef.ref);
    return file !== null;
  }

  const fsResult = await DustFileSystem.fromScopedPath(auth, matchingRef.ref);
  if (fsResult.isErr()) {
    return false;
  }

  const statResult = await fsResult.value.stat(matchingRef.ref);
  return statResult.isOk() && statResult.value !== null;
}
