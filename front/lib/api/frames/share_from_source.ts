import path from "node:path";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem } from "@app/lib/api/file_system";
import { withFrameSourceAndPublishLock } from "@app/lib/api/frames/publication_storage";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import {
  checkFrameEmailGrantPermission,
  checkFrameShareScopePermission,
} from "@app/lib/api/share/frame_sharing";
import { ensureAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { FileShareScope } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export class FrameSharingError extends Error {
  constructor(
    readonly code: "conflict" | "internal" | "invalid_source" | "unauthorized",
    message: string
  ) {
    super(message);
    this.name = "FrameSharingError";
  }
}

export function isFrameSharingError(
  error: unknown
): error is FrameSharingError {
  return error instanceof FrameSharingError;
}

export type ShareFrameV2FromSourceError =
  | DustFileSystemError
  | FrameSharingError
  | SandboxFunctionError;

function sharingError(
  code: FrameSharingError["code"],
  message: string
): Err<FrameSharingError> {
  return new Err(new FrameSharingError(code, message));
}

export type ShareFrameV2FromSourceResult = {
  emails: string[];
  frameId: string;
  shareScope: FileShareScope;
  shareUrl: string;
  sourceDirectoryPath: string;
};

/** Configure the use rights of the registered Frame package at a writable source path. */
export async function shareFrameV2FromSource(
  auth: Authenticator,
  {
    conversation,
    emails,
    shareScope,
    sourceDirectoryPath,
  }: {
    conversation: ConversationWithoutContentType;
    emails: string[];
    shareScope: FileShareScope;
    sourceDirectoryPath: string;
  }
): Promise<Result<ShareFrameV2FromSourceResult, ShareFrameV2FromSourceError>> {
  const sourceDirectory =
    DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  if (
    !sourceDirectory ||
    !sourceDirectory.includes("/") ||
    path.posix.basename(sourceDirectory) === FRAME_MANIFEST_FILE
  ) {
    return sharingError(
      "invalid_source",
      "Frame sharing requires its source folder under /files."
    );
  }
  const manifestPath = path.posix.join(sourceDirectory, FRAME_MANIFEST_FILE);

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return sharingError(
      "invalid_source",
      "Frames v2 sharing does not yet support the database-backed filesystem."
    );
  }

  const writeAccess = dustFs.checkWriteAccess(sourceDirectory);
  if (writeAccess.isErr()) {
    return new Err(writeAccess.error);
  }
  const mountFilePath = dustFs.toMountFilePath(manifestPath);
  if (!mountFilePath) {
    return sharingError("invalid_source", "Invalid Frame source folder.");
  }

  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    mountFilePath,
  ]);
  if (!frame?.isFrameV2) {
    return sharingError(
      "invalid_source",
      `No registered Frames v2 package found at ${sourceDirectory}.`
    );
  }

  return withFrameSourceAndPublishLock<
    ShareFrameV2FromSourceResult,
    FrameSharingError
  >(frame.sId, async () => {
    const freshFrame = await FileResource.fetchById(auth, frame.sId);
    if (
      !freshFrame?.isFrameV2 ||
      freshFrame.toScopedPath(auth) !== manifestPath
    ) {
      return sharingError(
        "conflict",
        "The Frame source changed while sharing was being configured; retry from its current path."
      );
    }

    const scopePermission = await checkFrameShareScopePermission(
      auth,
      shareScope
    );
    if (scopePermission.isErr()) {
      return sharingError("unauthorized", scopePermission.error.message);
    }
    const emailPermission = await checkFrameEmailGrantPermission(auth, emails);
    if (emailPermission.isErr()) {
      return sharingError("unauthorized", emailPermission.error.message);
    }

    try {
      await freshFrame.setShareScope(auth, shareScope);

      const allowlist = await ensureAuthorizedFileAccessForShare(
        auth,
        freshFrame
      );
      if (allowlist.isErr()) {
        return sharingError(
          allowlist.error.code === "invalid_request_error"
            ? "invalid_source"
            : "internal",
          allowlist.error.message
        );
      }

      const grants =
        emails.length > 0
          ? await freshFrame.addSharingGrants(auth, { emails })
          : await freshFrame.listActiveSharingGrants();
      const shareInfo = await freshFrame.getShareInfo();
      if (!shareInfo) {
        return sharingError("internal", "Frame sharing record not found.");
      }

      const frameName = path.posix.basename(sourceDirectory);
      void emitAuditLogEvent({
        auth,
        action: "frame.share_scope_updated",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("frame", {
            sId: freshFrame.sId,
            name: frameName,
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          frame_name: frameName,
          share_scope: shareScope,
        },
      });
      if (emails.length > 0) {
        void emitAuditLogEvent({
          auth,
          action: "frame.email_grant_added",
          targets: [
            buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
            buildAuditLogTarget("frame", {
              sId: freshFrame.sId,
              name: frameName,
            }),
          ],
          context: getAuditLogContext(auth),
          metadata: {
            emails: emails.join(","),
            frame_name: frameName,
          },
        });
      }

      return new Ok({
        emails: grants.map((grant) => grant.email),
        frameId: freshFrame.sId,
        shareScope: shareInfo.scope,
        shareUrl: shareInfo.shareUrl,
        sourceDirectoryPath: sourceDirectory,
      });
    } catch (error) {
      return sharingError("internal", normalizeError(error).message);
    }
  });
}
