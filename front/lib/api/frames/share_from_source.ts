import path from "node:path";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem } from "@app/lib/api/file_system";
import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import {
  checkFrameEmailGrantPermission,
  checkFrameShareScopePermission,
} from "@app/lib/api/share/frame_sharing";
import {
  computeAuthorizedFileAccessForShare,
  readFrameFileContent,
} from "@app/lib/api/viz/authorized_file_access";
import {
  isAllowlistShareScopeStale,
  isAllowlistStale,
} from "@app/lib/api/viz/authorized_file_access_policy";
import { emitFrameAuthorizedFilesUpdatedAuditLog } from "@app/lib/api/viz/frame_authorized_files_audit";
import type { Authenticator } from "@app/lib/auth";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type {
  ComputedAuthorizedFileAccess,
  FileShareScope,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
  | FrameSharingError;

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

/** Configure use rights for a registered Frame at a writable source path. */
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
  if (!auth.user()) {
    return sharingError(
      "unauthorized",
      "Frame sharing requires a workspace member."
    );
  }

  const sourceDirectory =
    DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  if (
    !sourceDirectory ||
    !sourceDirectory.includes("/") ||
    path.posix.basename(sourceDirectory) === FRAME_MANIFEST_FILE
  ) {
    return sharingError(
      "invalid_source",
      "Frame sharing requires a source folder path."
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
      "Frames v2 sharing does not support the database-backed filesystem."
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

  const shared = await withFramePublishLock<
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

    const frameContent = await readFrameFileContent(auth, freshFrame);
    if (frameContent === null) {
      return sharingError(
        "invalid_source",
        "Publish the Frame before configuring its use rights."
      );
    }

    const [previousShareScope, activeAllowlist, activeAllowlistShareScope] =
      await Promise.all([
        freshFrame.getShareScope(),
        freshFrame.getActiveAuthorizedFileAccessAllowlist(),
        freshFrame.getActiveAuthorizedFileAccessShareScope(),
      ]);
    const shouldPersistAllowlist =
      !activeAllowlist ||
      isAllowlistStale(activeAllowlist, frameContent) ||
      activeAllowlistShareScope === null ||
      isAllowlistShareScopeStale(activeAllowlistShareScope, shareScope);

    let authorizedFileAccess: ComputedAuthorizedFileAccess | null = null;
    if (shouldPersistAllowlist) {
      const computed = await computeAuthorizedFileAccessForShare(
        auth,
        freshFrame,
        { frameContent }
      );
      if (computed.isErr()) {
        return sharingError(
          computed.error.code === "invalid_request_error"
            ? "invalid_source"
            : "internal",
          computed.error.message
        );
      }
      authorizedFileAccess = computed.value;
    }

    const createdEmails = await withTransaction(async (transaction) => {
      if (previousShareScope !== shareScope) {
        await freshFrame.setShareScope(auth, shareScope, transaction);
      }
      if (authorizedFileAccess) {
        await freshFrame.persistAuthorizedFileAccess(authorizedFileAccess, {
          transaction,
        });
      }
      return freshFrame.addSharingGrantsAndGetCreatedEmails(
        auth,
        { emails },
        { transaction }
      );
    });

    const [grants, shareInfo] = await Promise.all([
      freshFrame.listActiveSharingGrants(),
      freshFrame.getShareInfo(),
    ]);
    if (!shareInfo) {
      throw new Error(`Frame sharing record not found for ${freshFrame.sId}.`);
    }

    const frameName = path.posix.basename(sourceDirectory);
    if (previousShareScope !== shareScope) {
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
    }
    if (authorizedFileAccess) {
      emitFrameAuthorizedFilesUpdatedAuditLog(
        auth,
        freshFrame,
        authorizedFileAccess,
        shareScope
      );
    }
    if (createdEmails.length > 0) {
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
          emails: createdEmails.join(","),
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
  });

  if (shared.isErr()) {
    if (isLockAcquisitionTimeoutError(shared.error)) {
      return sharingError(
        "conflict",
        "Another publication is in progress for this Frame; retry shortly."
      );
    }
    return new Err(shared.error);
  }
  return new Ok(shared.value);
}
