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
import type { FramePublicationDescriptor } from "@app/types/api/frame_publication";
import {
  getFramePublicationsBasePath,
  isSafeFrameStorageSegment,
} from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import chunk from "lodash/chunk";

/**
 * Backfill one `frame_publications` row per committed publication already in GCS, for every
 * Frames v2 file. Publications stored since the table shipped already have their row; this covers
 * the older ones. A publication whose `publication.json` cannot be read gets no row: it is either
 * uncommitted or unreadable, and publication retention already reports those.
 *
 * Database work is batched per workspace; only the GCS reads run per Frame.
 *
 * Idempotent (existing rows are skipped). Dry-run by default; pass `--execute` to insert.
 *
 *   npx tsx migrations/20260923_backfill_frame_publications.ts
 *   npx tsx migrations/20260923_backfill_frame_publications.ts --execute
 */

const DEFAULT_CONCURRENCY = 4;
const INSERT_BATCH_SIZE = 500;

type PublicationToInsert = {
  frame: FileResource;
  publicationId: string;
  descriptor: FramePublicationDescriptor;
};

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

    const fileModelIdsByWorkspaceModelId = new Map<ModelId, ModelId[]>();
    for (const { id, workspaceId } of frameRows) {
      const fileModelIds =
        fileModelIdsByWorkspaceModelId.get(workspaceId) ?? [];
      fileModelIds.push(id);
      fileModelIdsByWorkspaceModelId.set(workspaceId, fileModelIds);
    }

    const workspaces = (
      await WorkspaceResource.fetchByModelIds([
        ...fileModelIdsByWorkspaceModelId.keys(),
      ])
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
      const fileModelIds =
        fileModelIdsByWorkspaceModelId.get(workspace.id) ?? [];
      const [frames, existingRows] = await Promise.all([
        FileResource.fetchByModelIdsWithAuth(auth, fileModelIds),
        FramePublicationModel.findAll({
          attributes: ["fileId", "publicationId"],
          where: { workspaceId: workspace.id, fileId: fileModelIds },
          raw: true,
        }),
      ]);
      const existingKeys = new Set(
        existingRows.map(
          ({ fileId, publicationId }) => `${fileId}/${publicationId}`
        )
      );

      let alreadyPresent = 0;
      let unreadable = 0;

      const perFrame = await concurrentExecutor(
        frames,
        async (frame): Promise<PublicationToInsert[]> => {
          const publicationIds = await bucket.listSubdirectoryNames({
            prefix: getFramePublicationsBasePath({
              workspaceId: workspace.sId,
              frameId: frame.sId,
            }),
          });

          return removeNulls(
            await concurrentExecutor(
              publicationIds,
              async (publicationId) => {
                if (existingKeys.has(`${frame.id}/${publicationId}`)) {
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

                return { frame, publicationId, descriptor: descriptor.value };
              },
              { concurrency }
            )
          );
        },
        { concurrency }
      );
      const toInsert = perFrame.flat();

      const publishers = await UserResource.fetchByIds(
        removeNulls(toInsert.map(({ descriptor }) => descriptor.publisherId))
      );
      const publisherModelIdsById = new Map(
        publishers.map((user) => [user.sId, user.id])
      );

      for (const { frame, publicationId } of toInsert) {
        logger.info(
          { workspaceId: workspace.sId, frameId: frame.sId, publicationId },
          execute
            ? "[backfill_frame_publications] Inserting row"
            : "[backfill_frame_publications] Would insert row (dry-run)"
        );
      }

      if (execute) {
        for (const batch of chunk(toInsert, INSERT_BATCH_SIZE)) {
          // A publication stored concurrently already has its row: ignore the duplicate.
          await FramePublicationModel.bulkCreate(
            batch.map(({ frame, publicationId, descriptor }) => ({
              workspaceId: workspace.id,
              fileId: frame.id,
              publicationId,
              createdAt: new Date(descriptor.publishedAt),
              publishedByUserId: descriptor.publisherId
                ? (publisherModelIdsById.get(descriptor.publisherId) ?? null)
                : null,
            })),
            { ignoreDuplicates: true }
          );
        }
      }

      logger.info(
        {
          workspaceId: workspace.sId,
          frameCount: frames.length,
          inserted: toInsert.length,
          alreadyPresent,
          unreadable,
          execute,
        },
        "[backfill_frame_publications] Workspace done"
      );
    }
  }
);
