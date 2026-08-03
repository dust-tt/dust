/*
import type { Logger } from "pino";
import { Op, QueryTypes } from "sequelize";

import { readFrameFileContent } from "@app/lib/api/viz/authorized_file_access";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  AuthorizedFileAccessModel,
  FileModel,
  ShareableFileModel,
} from "@app/lib/resources/storage/models/files";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_WORKSPACE_CONCURRENCY = 2;
const DEFAULT_BATCH_CONCURRENCY = 4;

const FRAME_CONTENT_TYPES = [frameContentType, frameSlideshowContentType];

type BackfillFailureReason =
  | "no_author_principal"
  | "conversation_not_found"
  | "content_read_failed"
  | "no_verified_refs"
  | "compute_error";

type BackfillStats = {
  processedCount: number;
  backfilledCount: number;
  skippedCount: number;
  failedCount: number;
};

function pendingFramesSqlFilter(force: boolean): string {
  return force
    ? ""
    : `
      AND NOT EXISTS (
        SELECT 1
        FROM "authorized_file_accesses" afa
        WHERE afa."shareableFileId" = sf."id"
          AND afa."revokedAt" IS NULL
      )
    `;
}

async function findWorkspaceModelIdsWithPendingFrames(
  force: boolean
): Promise<ModelId[]> {
  const rows = await frontSequelize.query<{ workspaceId: ModelId }>(
    `
      SELECT DISTINCT sf."workspaceId"
      FROM shareable_files sf
      INNER JOIN files f ON f."id" = sf."fileId"
      WHERE f."status" = 'ready'
        AND sf."sharedBy" IS NOT NULL
        AND f."contentType" IN (:frameContentTypes)
        ${pendingFramesSqlFilter(force)}
      ORDER BY sf."workspaceId" ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { frameContentTypes: FRAME_CONTENT_TYPES },
    }
  );
  return rows.map((r) => r.workspaceId);
}

async function workspaceHasPendingFrames(
  workspaceId: ModelId,
  force: boolean
): Promise<boolean> {
  const rows = await frontSequelize.query<{ pending: number }>(
    `
      SELECT 1 AS pending
      FROM shareable_files sf
      INNER JOIN files f ON f."id" = sf."fileId"
      WHERE sf."workspaceId" = :workspaceId
        AND f."status" = 'ready'
        AND sf."sharedBy" IS NOT NULL
        AND f."contentType" IN (:frameContentTypes)
        ${pendingFramesSqlFilter(force)}
      LIMIT 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { workspaceId, frameContentTypes: FRAME_CONTENT_TYPES },
    }
  );
  return rows.length > 0;
}

async function authForUserModelId(
  workspace: LightWorkspaceType,
  userModelId: ModelId
): Promise<Authenticator | null> {
  const [user] = await UserResource.fetchByModelIds([userModelId]);
  if (!user) {
    return null;
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  return auth.user() ? auth : null;
}

async function resolveAuthorAuthFromConversation(
  workspace: LightWorkspaceType,
  frameFile: FileResource
): Promise<Authenticator | null> {
  const conversationId =
    frameFile.useCaseMetadata?.sourceConversationId ??
    frameFile.useCaseMetadata?.conversationId ??
    null;
  if (!conversationId) {
    return null;
  }

  const internalAuth = await Authenticator.internalBuilderForWorkspace(
    workspace.sId
  );
  const conversation = await ConversationResource.fetchById(
    internalAuth,
    conversationId,
    { dangerouslySkipPermissionFiltering: true }
  );
  if (!conversation) {
    return null;
  }

  const participants = await ConversationResource.listParticipantDetails(
    internalAuth,
    conversation.toJSON()
  );
  const postedParticipant = participants.find((p) => p.action === "posted");
  if (!postedParticipant) {
    return null;
  }

  return authForUserModelId(workspace, postedParticipant.userId);
}

async function resolveAuthorAuth(
  workspace: LightWorkspaceType,
  {
    sharedByUserModelId,
    fileUserModelId,
    frameFile,
  }: {
    sharedByUserModelId: ModelId | null;
    fileUserModelId: ModelId | null;
    frameFile: FileResource;
  }
): Promise<Authenticator | null> {
  for (const userModelId of removeNulls([
    sharedByUserModelId,
    fileUserModelId,
  ])) {
    const auth = await authForUserModelId(workspace, userModelId);
    if (auth) {
      return auth;
    }
  }

  return resolveAuthorAuthFromConversation(workspace, frameFile);
}

async function conversationExistsForFrame(
  workspace: LightWorkspaceType,
  frameFile: FileResource
): Promise<boolean> {
  const conversationId =
    frameFile.useCaseMetadata?.sourceConversationId ??
    frameFile.useCaseMetadata?.conversationId;
  if (frameFile.useCase !== "conversation" || !conversationId) {
    return true;
  }

  const auth = await Authenticator.internalBuilderForWorkspace(workspace.sId);
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    { dangerouslySkipPermissionFiltering: true }
  );
  return conversation !== null;
}

async function hasActiveAllowlistRows(
  shareableFileId: ModelId,
  workspaceId: ModelId
): Promise<boolean> {
  const row = await AuthorizedFileAccessModel.findOne({
    where: {
      shareableFileId,
      workspaceId,
      revokedAt: null,
    },
  });
  return row !== null;
}

function logFailure(
  logger: Logger,
  {
    workspaceId,
    shareableFileId,
    fileId,
    reason,
    unverifiableRefs,
  }: {
    workspaceId: string;
    shareableFileId: number;
    fileId: string;
    reason: BackfillFailureReason;
    unverifiableRefs?: string[];
  }
): void {
  logger.warn(
    {
      workspaceId,
      shareableFileId,
      fileId,
      reason,
      unverifiableRefs,
    },
    "Frame allowlist backfill failed"
  );
}

async function backfillFrame(
  workspace: LightWorkspaceType,
  shareableFile: ShareableFileModel,
  {
    execute,
    force,
    logger,
  }: {
    execute: boolean;
    force: boolean;
    logger: Logger;
  }
): Promise<"backfilled" | "skipped" | "failed"> {
  const fileModel =
    shareableFile.file ??
    (await FileModel.findOne({
      where: {
        id: shareableFile.fileId,
        workspaceId: shareableFile.workspaceId,
      },
    }));
  if (!fileModel) {
    logger.warn(
      { shareableFileId: shareableFile.id, fileId: shareableFile.fileId },
      "Shareable file has no associated frame file, skipping"
    );
    return "skipped";
  }

  const frameFile = new FileResource(FileResource.model, fileModel.get());

  if (!force) {
    const hasActiveRows = await hasActiveAllowlistRows(
      shareableFile.id,
      frameFile.workspaceId
    );
    if (hasActiveRows) {
      logger.info(
        { fileId: frameFile.sId, shareableFileId: shareableFile.id },
        "Frame already has an active allowlist, skipping"
      );
      return "skipped";
    }
  }

  const auth = await resolveAuthorAuth(workspace, {
    sharedByUserModelId: shareableFile.sharedBy,
    fileUserModelId: frameFile.userId,
    frameFile,
  });
  if (!auth) {
    logFailure(logger, {
      workspaceId: workspace.sId,
      shareableFileId: shareableFile.id,
      fileId: frameFile.sId,
      reason: "no_author_principal",
    });
    return "failed";
  }

  const conversationOk = await conversationExistsForFrame(workspace, frameFile);
  if (!conversationOk) {
    logFailure(logger, {
      workspaceId: workspace.sId,
      shareableFileId: shareableFile.id,
      fileId: frameFile.sId,
      reason: "conversation_not_found",
    });
    return "failed";
  }

  const frameContent = await readFrameFileContent(auth, frameFile);
  if (frameContent === null) {
    logFailure(logger, {
      workspaceId: workspace.sId,
      shareableFileId: shareableFile.id,
      fileId: frameFile.sId,
      reason: "content_read_failed",
    });
    return "failed";
  }

  let authorized;
  try {
    authorized = await frameFile.computeAuthorizedFileAccess(auth, {
      frameContent,
    });
  } catch (err) {
    logFailure(logger, {
      workspaceId: workspace.sId,
      shareableFileId: shareableFile.id,
      fileId: frameFile.sId,
      reason: "compute_error",
    });
    logger.error(
      { err, fileId: frameFile.sId, shareableFileId: shareableFile.id },
      "Failed to compute authorized file access"
    );
    return "failed";
  }

  if (authorized.refs.length === 0) {
    const hasUnverifiableRefs =
      authorized.unverifiableRefs !== undefined &&
      authorized.unverifiableRefs.length > 0;

    if (hasUnverifiableRefs) {
      logFailure(logger, {
        workspaceId: workspace.sId,
        shareableFileId: shareableFile.id,
        fileId: frameFile.sId,
        reason: "no_verified_refs",
        unverifiableRefs: authorized.unverifiableRefs,
      });
      return "failed";
    }

    logger.info(
      { fileId: frameFile.sId, shareableFileId: shareableFile.id },
      execute
        ? "Skipped persist for frame with no file refs (remains on legacy access path)"
        : "Would skip persist for frame with no file refs (remains on legacy access path)"
    );
    return "backfilled";
  }

  if (execute) {
    await frameFile.persistAuthorizedFileAccess(authorized);
  }

  logger.info(
    {
      fileId: frameFile.sId,
      shareableFileId: shareableFile.id,
      refCount: authorized.refs.length,
      unverifiableRefs: authorized.unverifiableRefs,
    },
    execute ? "Backfilled frame authorized file access" : "Would backfill frame"
  );

  return "backfilled";
}

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
    force,
    batchSize,
    batchConcurrency,
    limit,
    logger: parentLogger,
  }: {
    execute: boolean;
    force: boolean;
    batchSize: number;
    batchConcurrency: number;
    limit: number | undefined;
    logger: Logger;
  }
): Promise<BackfillStats> {
  const logger = parentLogger.child({ workspaceId: workspace.sId });
  let cursorId = 0;
  const stats: BackfillStats = {
    processedCount: 0,
    backfilledCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };

  while (true) {
    if (limit !== undefined && stats.processedCount >= limit) {
      logger.info(
        { processedCount: stats.processedCount, limit },
        "Reached per-workspace limit"
      );
      break;
    }

    const remainingLimit =
      limit !== undefined ? limit - stats.processedCount : undefined;
    const effectiveBatchSize =
      remainingLimit !== undefined
        ? Math.min(batchSize, remainingLimit)
        : batchSize;

    const where: Record<string, unknown> = {
      workspaceId: workspace.id,
      id: { [Op.gt]: cursorId },
      sharedBy: { [Op.not]: null },
    };

    const shareableFiles = await ShareableFileModel.findAll({
      where,
      include: [
        {
          model: FileModel,
          required: true,
          where: {
            status: "ready",
            contentType: { [Op.in]: FRAME_CONTENT_TYPES },
          },
        },
      ],
      order: [["id", "ASC"]],
      limit: effectiveBatchSize,
    });

    const pendingShareableFiles = force
      ? shareableFiles
      : (
          await Promise.all(
            shareableFiles.map(async (shareableFile) => {
              const hasActiveRows = await hasActiveAllowlistRows(
                shareableFile.id,
                workspace.id
              );
              return hasActiveRows ? null : shareableFile;
            })
          )
        ).filter((shareableFile) => shareableFile !== null);

    if (pendingShareableFiles.length === 0) {
      if (shareableFiles.length === 0) {
        break;
      }
      if (shareableFiles.length < effectiveBatchSize) {
        break;
      }
      cursorId = shareableFiles[shareableFiles.length - 1].id;
      continue;
    }

    cursorId = shareableFiles[shareableFiles.length - 1].id;

    const batchResults = await concurrentExecutor(
      pendingShareableFiles,
      async (shareableFile) => {
        return backfillFrame(workspace, shareableFile, {
          execute,
          force,
          logger,
        });
      },
      { concurrency: batchConcurrency }
    );

    for (const result of batchResults) {
      stats.processedCount++;
      if (result === "backfilled") {
        stats.backfilledCount++;
      } else if (result === "failed") {
        stats.failedCount++;
      } else {
        stats.skippedCount++;
      }
    }

    logger.info(
      {
        batchSize: pendingShareableFiles.length,
        ...stats,
      },
      "Processed batch"
    );

    if (shareableFiles.length < effectiveBatchSize) {
      break;
    }
  }

  logger.info({ ...stats, execute }, "Workspace backfill finished");

  return stats;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      required: false,
      description: "Run on a single workspace (sId).",
    },
    concurrency: {
      type: "number",
      default: DEFAULT_WORKSPACE_CONCURRENCY,
      description: "Number of concurrent workspaces processed.",
    },
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      description: "Shareable-file cursor page size per workspace.",
    },
    batchConcurrency: {
      type: "number",
      default: DEFAULT_BATCH_CONCURRENCY,
      description: "Concurrent frames processed within each batch.",
    },
    force: {
      type: "boolean",
      default: false,
      description:
        "Recompute frames that already have active authorized_file_access rows.",
    },
    limit: {
      type: "number",
      required: false,
      description: "Cap frames processed per workspace (dev/testing).",
    },
  },
  async (
    {
      workspaceId,
      execute,
      concurrency,
      batchSize,
      batchConcurrency,
      force,
      limit,
    },
    logger
  ) => {
    const totals: BackfillStats = {
      processedCount: 0,
      backfilledCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    logger.info(
      {
        execute,
        force,
        batchSize,
        batchConcurrency,
        concurrency,
        limit,
        workspaceId,
      },
      "Starting frame authorized file access backfill"
    );

    const runWorkspace = async (workspace: LightWorkspaceType) => {
      const hasPendingFrames = await workspaceHasPendingFrames(
        workspace.id,
        force
      );
      if (!hasPendingFrames) {
        logger.info(
          { workspaceId: workspace.sId },
          "No pending frame allowlists in workspace, skipping"
        );
        return;
      }

      const stats = await backfillWorkspace(workspace, {
        execute,
        force,
        batchSize,
        batchConcurrency,
        limit,
        logger,
      });

      totals.processedCount += stats.processedCount;
      totals.backfilledCount += stats.backfilledCount;
      totals.skippedCount += stats.skippedCount;
      totals.failedCount += stats.failedCount;
    };

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      await runWorkspace(renderLightWorkspaceType({ workspace }));
    } else {
      const workspaceModelIds =
        await findWorkspaceModelIdsWithPendingFrames(force);
      if (workspaceModelIds.length === 0) {
        logger.info("No shareable files pending backfill");
        return;
      }

      const workspaces =
        await WorkspaceResource.fetchByModelIds(workspaceModelIds);

      logger.info(
        { workspaceCount: workspaces.length },
        "Workspaces with pending frame allowlist backfill"
      );

      await concurrentExecutor(
        workspaces.map((ws) => renderLightWorkspaceType({ workspace: ws })),
        runWorkspace,
        { concurrency }
      );
    }

    logger.info(
      { ...totals, execute },
      "Frame authorized file access backfill completed"
    );
  }
);
*/
