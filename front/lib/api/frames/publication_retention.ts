import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { getFramePublicationBasePath } from "@app/types/api/frame_storage";
import assert from "assert";

const FRAME_PUBLICATION_PURGE_CONCURRENCY = 4;

export type StaleFramePublicationPurgeResult = {
  deletedFunctionCount: number;
  deletedPublicationCount: number;
};

/**
 * @cc [owner:davidebbo,label:product] retention-keeps-the-active-publication
 * The publication named by the Frame's `activePublicationId` MUST never be purged, whatever its
 * age: it is the only one the Frame serves.
 */
/**
 * @cc [owner:davidebbo,label:product] retention-keeps-publications-with-invocations
 * A publication whose functions still have invocations MUST be kept. Those invocations FK the
 * function rows with `RESTRICT`, and their own retention sweep is what eventually frees the
 * publication — a publication can gain no new invocation once it stops being the active one, so
 * waiting always terminates.
 */
/**
 * @cc [owner:davidebbo,label:backend] retention-deletes-publication-row-last
 * A purged publication's `frame_publications` row MUST be deleted only after its function rows and
 * its GCS prefix. Retention finds publications through that row, so a crash before the row is
 * gone leaves it for the next sweep to finish, where deleting it first would strand the rest.
 */
/**
 * Delete the superseded publications of one Frame: their function rows, their whole GCS prefix and
 * their `frame_publications` row. Publications are enumerated from `frame_publications`, whose row
 * `storeFramePublication` commits before writing any object, and aged by the row's `createdAt`.
 *
 * Aging by the row also covers a publish that failed mid-upload (row, but no `publication.json`),
 * and keeps the window between `storeFramePublication` and `activateFramePublication` safe: a
 * publication stored seconds ago is not yet active, and is far too recent to be eligible.
 */
export async function purgeStaleFramePublications(
  auth: Authenticator,
  {
    frame,
    retentionMs,
  }: {
    frame: FileResource;
    retentionMs: number;
  }
): Promise<StaleFramePublicationPurgeResult> {
  const owner = auth.getNonNullableWorkspace();
  assert(
    frame.isFrameV2 && frame.workspaceId === owner.id,
    "Publication retention requires a Frames v2 file of the auth's workspace."
  );

  const [publications, publicationIdsWithInvocations] = await Promise.all([
    FramePublicationResource.listForFrame(auth, frame),
    SandboxFunctionResource.listFramePublicationIdsWithInvocations(auth, frame),
  ]);

  const activePublicationId = frame.useCaseMetadata?.activePublicationId;
  const cutoffDate = new Date(Date.now() - retentionMs);
  const stalePublications = publications.filter(
    ({ createdAt, publicationId }) =>
      publicationId !== activePublicationId &&
      createdAt < cutoffDate &&
      !publicationIdsWithInvocations.has(publicationId)
  );
  if (stalePublications.length === 0) {
    return { deletedFunctionCount: 0, deletedPublicationCount: 0 };
  }

  const stalePublicationIds = stalePublications.map(
    ({ publicationId }) => publicationId
  );
  const deletedFunctionCount =
    await SandboxFunctionResource.deleteAllForFramePublications(auth, {
      frame,
      publicationIds: stalePublicationIds,
    });

  const storage = getPrivateUploadBucket();
  await concurrentExecutor(
    stalePublicationIds,
    (publicationId) =>
      storage.deleteByPrefix(
        getFramePublicationBasePath({
          workspaceId: owner.sId,
          frameId: frame.sId,
          publicationId,
        })
      ),
    { concurrency: FRAME_PUBLICATION_PURGE_CONCURRENCY }
  );

  await FramePublicationResource.deleteForFramePublications(auth, {
    frame,
    publicationIds: stalePublicationIds,
  });

  logger.info(
    {
      deletedFunctionCount,
      frameId: frame.sId,
      publicationIds: stalePublicationIds,
      workspaceId: owner.sId,
    },
    "[Frames Retention] Purged superseded Frame publications."
  );

  return {
    deletedFunctionCount,
    deletedPublicationCount: stalePublicationIds.length,
  };
}
