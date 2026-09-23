import { loadFramePublicationDescriptor } from "@app/lib/api/frames/publication_storage";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { FramePublicationModel } from "@app/lib/resources/storage/models/frame_publication";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import {
  getFramePublicationsBasePath,
  isSafeFrameStorageSegment,
} from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";

/**
 * Backfill one `frame_publications` row per committed publication already in GCS, for every
 * Frames v2 file. Publications stored since the table shipped already have their row; this covers
 * the older ones. A publication whose `publication.json` cannot be read gets no row: it is either
 * uncommitted or unreadable, and publication retention already reports those.
 *
 * Idempotent (existing rows are skipped). Dry-run by default; pass `--execute` to insert.
 *
 *   npx tsx migrations/20260923_backfill_frame_publications.ts
 *   npx tsx migrations/20260923_backfill_frame_publications.ts --execute
 */

const DEFAULT_CONCURRENCY = 4;

makeScript(
  {
    concurrency: {
      type: "number",
      default: DEFAULT_CONCURRENCY,
      describe: "Concurrent Frames processed per workspace.",
    },
  },
  async ({ execute, concurrency }, logger) => {
    const frameRows = await FileModel.findAll({
      attributes: ["id", "workspaceId"],
      where: { contentType: frameV2ContentType },
      // @ts-expect-error
      // WORKSPACE_ISOLATION_BYPASS: Discovery query across workspaces that own Frames v2.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      raw: true,
    });

    const fileIdsByWorkspaceId = new Map<ModelId, ModelId[]>();
    for (const { id, workspaceId } of frameRows) {
      const fileIds = fileIdsByWorkspaceId.get(workspaceId) ?? [];
      fileIds.push(id);
      fileIdsByWorkspaceId.set(workspaceId, fileIds);
    }

    const workspaces = (
      await WorkspaceResource.fetchByModelIds([...fileIdsByWorkspaceId.keys()])
    ).map((workspace) => renderLightWorkspaceType({ workspace }));

    logger.info(
      {
        workspaceCount: workspaces.length,
        frameCount: frameRows.length,
        execute,
      },
      "[backfill_frame_publications] Starting"
    );

    const bucket = getPrivateUploadBucket();

    for (const workspace of workspaces) {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      const frames = await FileResource.fetchByModelIdsWithAuth(
        auth,
        fileIdsByWorkspaceId.get(workspace.id) ?? []
      );

      let inserted = 0;
      let alreadyPresent = 0;
      let unreadable = 0;

      await concurrentExecutor(
        frames,
        async (frame) => {
          const [publicationIds, existingRows] = await Promise.all([
            bucket.listSubdirectoryNames({
              prefix: getFramePublicationsBasePath({
                workspaceId: workspace.sId,
                frameId: frame.sId,
              }),
            }),
            FramePublicationModel.findAll({
              attributes: ["publicationId"],
              where: { workspaceId: workspace.id, fileId: frame.id },
              raw: true,
            }),
          ]);
          const existingPublicationIds = new Set(
            existingRows.map(({ publicationId }) => publicationId)
          );

          const descriptors = removeNulls(
            await concurrentExecutor(
              publicationIds,
              async (publicationId) => {
                if (existingPublicationIds.has(publicationId)) {
                  alreadyPresent++;
                  return null;
                }

                const logContext = {
                  workspaceId: workspace.sId,
                  frameId: frame.sId,
                  publicationId,
                };
                if (!isSafeFrameStorageSegment(publicationId)) {
                  unreadable++;
                  logger.warn(
                    logContext,
                    "[backfill_frame_publications] Skipping publication directory with an unsafe name"
                  );
                  return null;
                }

                const descriptor = await loadFramePublicationDescriptor(auth, {
                  frame,
                  publicationId,
                });
                if (descriptor.isErr()) {
                  unreadable++;
                  logger.warn(
                    { ...logContext, error: descriptor.error.message },
                    "[backfill_frame_publications] Skipping unreadable publication"
                  );
                  return null;
                }

                return { publicationId, descriptor: descriptor.value };
              },
              { concurrency }
            )
          );
          if (descriptors.length === 0) {
            return;
          }

          const publishers = await UserResource.fetchByIds(
            removeNulls(
              descriptors.map(({ descriptor }) => descriptor.publisherId)
            )
          );
          const publisherModelIdsById = new Map(
            publishers.map((user) => [user.sId, user.id])
          );

          logger.info(
            {
              workspaceId: workspace.sId,
              frameId: frame.sId,
              publicationIds: descriptors.map(
                ({ publicationId }) => publicationId
              ),
            },
            execute
              ? "[backfill_frame_publications] Inserting rows"
              : "[backfill_frame_publications] Would insert rows (dry-run)"
          );
          inserted += descriptors.length;
          if (!execute) {
            return;
          }

          // A publication stored concurrently already has its row: ignoring the duplicate keeps
          // the row its publisher wrote, which also knows the publishing agent.
          await FramePublicationModel.bulkCreate(
            descriptors.map(({ publicationId, descriptor }) => ({
              workspaceId: workspace.id,
              fileId: frame.id,
              publicationId,
              publishedAt: new Date(descriptor.publishedAt),
              publishedByUserId: descriptor.publisherId
                ? (publisherModelIdsById.get(descriptor.publisherId) ?? null)
                : null,
              publishedByAgentConfigurationId: null,
              description: descriptor.manifest.description,
              uiBundleSha256: descriptor.ui.bundleSha256,
            })),
            { ignoreDuplicates: true }
          );
        },
        { concurrency }
      );

      logger.info(
        {
          workspaceId: workspace.sId,
          frameCount: frames.length,
          inserted,
          alreadyPresent,
          unreadable,
          execute,
        },
        "[backfill_frame_publications] Workspace done"
      );
    }
  }
);
