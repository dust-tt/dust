import path from "node:path";

import { DustFileSystem } from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { FileShareScope } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class FrameShareLinkError extends Error {
  constructor(
    readonly code:
      | "internal"
      | "invalid_source"
      | "not_shared"
      | "unauthorized",
    message: string
  ) {
    super(message);
    this.name = "FrameShareLinkError";
  }
}

export type GetFrameShareLinkFromSourceError =
  | DustFileSystemError
  | FrameShareLinkError;

function shareLinkError(
  code: FrameShareLinkError["code"],
  message: string
): Err<FrameShareLinkError> {
  return new Err(new FrameShareLinkError(code, message));
}

export type FrameShareLinkResult = {
  frameId: string;
  shareScope: FileShareScope;
  shareUrl: string;
  sourceDirectoryPath: string;
};

/**
 * @cc [owner:davidebbo,label:product] share-link-source-resolution
 * `sourceDirectoryPath` MUST resolve to the Frames v2 package registered at
 * `<sourceDirectoryPath>/manifest.json`, or to the legacy Frame registered at `sourceDirectoryPath`
 * itself (its entry file, as created by `create_interactive_content_file` and published by
 * `dsbx frame publish`). Any other path fails with `invalid_source`.
 */
/**
 * @cc [owner:davidebbo,label:product;security] share-link-read-only
 * Retrieving a share link MUST NOT create, change, or remove sharing state. A Frame with no share
 * link fails with `not_shared`.
 */
export async function getFrameShareLinkFromSource(
  auth: Authenticator,
  {
    conversation,
    sourceDirectoryPath,
  }: {
    conversation: ConversationWithoutContentType;
    sourceDirectoryPath: string;
  }
): Promise<Result<FrameShareLinkResult, GetFrameShareLinkFromSourceError>> {
  if (!auth.user()) {
    return shareLinkError(
      "unauthorized",
      "Retrieving a Frame share link requires a workspace member."
    );
  }

  const sourcePath = DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  if (
    !sourcePath ||
    !sourcePath.includes("/") ||
    path.posix.basename(sourcePath) === FRAME_MANIFEST_FILE
  ) {
    return shareLinkError(
      "invalid_source",
      "Retrieving a Frame share link requires a Frame folder or a legacy Frame file path."
    );
  }
  const manifestPath = path.posix.join(sourcePath, FRAME_MANIFEST_FILE);

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }
  const dustFs = fsResult.value;
  const mount = dustFs
    .getMounts()
    .find(
      (candidate) =>
        sourcePath.startsWith(`${candidate.scopedPrefix}/`) &&
        candidate.permissions.canRead
    );
  if (!mount) {
    return shareLinkError(
      "unauthorized",
      "Read access to the Frame source is required."
    );
  }

  const sourceMountFilePath = dustFs.toMountFilePath(sourcePath);
  const manifestMountFilePath = dustFs.toMountFilePath(manifestPath);
  if (!sourceMountFilePath || !manifestMountFilePath) {
    return shareLinkError("invalid_source", "Invalid Frame source path.");
  }

  const files = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountFilePath,
    manifestMountFilePath,
  ]);
  const frame = files.find(
    (file) =>
      (file.mountFilePath === manifestMountFilePath && file.isFrameV2) ||
      (file.mountFilePath === sourceMountFilePath && file.isInteractiveContent)
  );
  if (!frame) {
    return shareLinkError(
      "invalid_source",
      `No registered Frame found at ${sourcePath}.`
    );
  }

  const shareInfo = await frame.getShareInfo();
  if (!shareInfo) {
    return shareLinkError(
      "not_shared",
      `No existing share link found for the Frame at ${sourcePath}. Configure sharing in the Dust UI.`
    );
  }

  return new Ok({
    frameId: frame.sId,
    shareScope: shareInfo.scope,
    shareUrl: shareInfo.shareUrl,
    sourceDirectoryPath: sourcePath,
  });
}
