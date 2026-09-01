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

/** Retrieve the existing share link for a registered Frame without changing its use rights. */
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

  const sourceDirectory =
    DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  if (
    !sourceDirectory ||
    !sourceDirectory.includes("/") ||
    path.posix.basename(sourceDirectory) === FRAME_MANIFEST_FILE
  ) {
    return shareLinkError(
      "invalid_source",
      "Retrieving a Frame share link requires a source folder path."
    );
  }
  const manifestPath = path.posix.join(sourceDirectory, FRAME_MANIFEST_FILE);

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return shareLinkError(
      "invalid_source",
      "Frames v2 share links do not support the database-backed filesystem."
    );
  }

  const mount = dustFs
    .getMounts()
    .find(
      (candidate) =>
        manifestPath.startsWith(`${candidate.scopedPrefix}/`) &&
        candidate.permissions.canRead
    );
  if (!mount) {
    return shareLinkError(
      "unauthorized",
      "Read access to the Frame source folder is required."
    );
  }

  const mountFilePath = dustFs.toMountFilePath(manifestPath);
  if (!mountFilePath) {
    return shareLinkError("invalid_source", "Invalid Frame source folder.");
  }

  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    mountFilePath,
  ]);
  if (!frame?.isFrameV2) {
    return shareLinkError(
      "invalid_source",
      `No registered Frames v2 package found at ${sourceDirectory}.`
    );
  }

  const shareInfo = await frame.getShareInfo();
  if (!shareInfo) {
    return shareLinkError(
      "not_shared",
      `No existing share link found for the Frame at ${sourceDirectory}. Configure sharing in the Dust UI.`
    );
  }

  return new Ok({
    frameId: frame.sId,
    shareScope: shareInfo.scope,
    shareUrl: shareInfo.shareUrl,
    sourceDirectoryPath: sourceDirectory,
  });
}
