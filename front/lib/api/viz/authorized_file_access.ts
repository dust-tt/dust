import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { legacyScopedPathsMatch } from "@app/lib/api/files/mount_path";
import {
  isAllowlistShareScopeStale,
  isAllowlistStale,
  isAuthorizedFileRef,
} from "@app/lib/api/viz/authorized_file_access_policy";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { streamToBuffer } from "@app/lib/utils/streams";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  AuthorizedFileAccessAllowlist,
  AuthorizedFileAccessShareError,
  ComputedAuthorizedFileAccess,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { Readable } from "stream";

export { resolveAllowlistedCanonicalPath } from "@app/lib/api/viz/authorized_file_access_policy";

function unverifiableFrameFileRefsShareError(
  unverifiableRefs: string[]
): AuthorizedFileAccessShareError {
  return {
    name: "dust_error",
    code: "invalid_request_error",
    message: `Frame references files that cannot be verified: ${unverifiableRefs.join(", ")}`,
    unverifiableRefs,
  };
}

async function readFrameFileContent(
  auth: Authenticator,
  frameFile: FileResource
): Promise<string | null> {
  const workspace = renderLightWorkspaceType({
    workspace: auth.getNonNullableWorkspace(),
  });
  const readStream = frameFile.getSharedReadStream(workspace, "original");
  const bufferResult = await streamToBuffer(readStream);
  if (bufferResult.isErr()) {
    return null;
  }

  return bufferResult.value.toString("utf-8") || null;
}

/**
 * Recomputes the allowlist when missing or stale on frame save.
 * Blocks when any static file ref cannot be verified under the author's auth.
 */
export async function ensureAuthorizedFileAccessForShare(
  auth: Authenticator,
  frameFile: FileResource
): Promise<
  Result<ComputedAuthorizedFileAccess, AuthorizedFileAccessShareError>
> {
  const frameContent = await readFrameFileContent(auth, frameFile);
  if (frameContent === null) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: `Failed to read frame content for authorized file access (file: ${frameFile.sId})`,
    });
  }

  const active = await frameFile.getActiveAuthorizedFileAccessAllowlist();
  const activeShareScope =
    await frameFile.getActiveAuthorizedFileAccessShareScope();
  const currentShareScope = await frameFile.getShareScope();
  const needsRecompute =
    !active ||
    isAllowlistStale(active, frameContent) ||
    (activeShareScope !== null &&
      isAllowlistShareScopeStale(activeShareScope, currentShareScope));

  if (!needsRecompute) {
    return new Ok(active);
  }

  const authorized = await frameFile.computeAuthorizedFileAccess(auth, {
    frameContent,
  });

  if (authorized.unverifiableRefs && authorized.unverifiableRefs.length > 0) {
    return new Err(
      unverifiableFrameFileRefsShareError(authorized.unverifiableRefs)
    );
  }

  await frameFile.persistAuthorizedFileAccess(authorized);

  return new Ok(authorized);
}

export type VizFileAuthorizationMode = "legacy" | "authorized" | "denied";

export type AllowlistedScopedVizFile = {
  contentType: string;
  stream: Readable;
};

/**
 * Read an allowlisted scoped path under the authoring user's access.
 * Share-token mounts only cover the frame context; cross-pod refs need this path.
 */
export async function readAllowlistedScopedVizFile({
  authorizedFileAccess,
  canonicalScopedPath,
  workspace,
}: {
  authorizedFileAccess: AuthorizedFileAccessAllowlist;
  canonicalScopedPath: string;
  workspace: LightWorkspaceType;
}): Promise<Result<AllowlistedScopedVizFile, void>> {
  const userId = authorizedFileAccess.computedByUserId;

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspace.sId
  );

  const fsResult = await DustFileSystem.fromScopedPath(
    auth,
    canonicalScopedPath
  );
  if (fsResult.isErr()) {
    return new Err(undefined);
  }

  const statResult = await fsResult.value.stat(canonicalScopedPath);
  if (statResult.isErr() || !statResult.value) {
    return new Err(undefined);
  }

  const readResult = await fsResult.value.read(canonicalScopedPath);
  if (readResult.isErr() || !readResult.value) {
    return new Err(undefined);
  }

  return new Ok({
    contentType: statResult.value.contentType,
    stream: readResult.value,
  });
}

/**
 * Gate viz file serving against the frame's stored allowlist.
 * Returns "legacy" when no allowlist exists yet (pre-backfill frames).
 */
export async function assertVizFileAuthorized({
  authorizedFileAccess,
  requestedRef,
  owner,
  frameContent,
}: {
  authorizedFileAccess: AuthorizedFileAccessAllowlist | null;
  requestedRef: string;
  owner: LightWorkspaceType;
  frameContent: string;
}): Promise<VizFileAuthorizationMode> {
  if (!authorizedFileAccess || authorizedFileAccess.refs.length === 0) {
    return "legacy";
  }

  if (isAllowlistStale(authorizedFileAccess, frameContent)) {
    return "denied";
  }

  if (!isAuthorizedFileRef(authorizedFileAccess, requestedRef)) {
    return "denied";
  }

  const hasAccess = await reverifyAuthorAccess(
    authorizedFileAccess,
    requestedRef,
    owner
  );
  return hasAccess ? "authorized" : "denied";
}

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
