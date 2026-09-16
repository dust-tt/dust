import { loadFramePublicationDescriptor } from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  getFramePublicationBasePath,
  getFramePublicationsBasePath,
  isSafeFrameStorageSegment,
} from "@app/types/api/frame_storage";

const FRAME_PUBLICATION_PURGE_CONCURRENCY = 4;

export type StaleFramePublicationPurgeResult = {
  deletedFunctionCount: number;
  deletedPublicationCount: number;
  keptPublicationCount: number;
  unreadablePublicationCount: number;
};

const EMPTY_PURGE_RESULT: StaleFramePublicationPurgeResult = {
  deletedFunctionCount: 0,
  deletedPublicationCount: 0,
  keptPublicationCount: 0,
  unreadablePublicationCount: 0,
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
 * Delete the superseded publications of one Frame: their function rows and their whole GCS
 * prefix. Publications are enumerated from storage rather than from `sandbox_functions`, because
 * a publication that declares no function leaves no row behind to find it by.
 *
 * The age check reads `publishedAt` from the publication's own descriptor, which also keeps the
 * window between `storeFramePublication` and `activateFramePublication` safe: a publication
 * written seconds ago is not yet active, and is far too recent to be eligible.
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
  if (!frame.isFrameV2 || frame.workspaceId !== owner.id) {
    return EMPTY_PURGE_RESULT;
  }

  const storage = getPrivateUploadBucket();
  const publicationIds = await storage.listSubdirectoryNames({
    prefix: getFramePublicationsBasePath({
      workspaceId: owner.sId,
      frameId: frame.sId,
    }),
  });

  const activePublicationId = frame.useCaseMetadata?.activePublicationId;
  const cutoffDate = new Date(Date.now() - retentionMs);

  const results = await concurrentExecutor(
    publicationIds,
    async (publicationId) => {
      if (
        publicationId === activePublicationId ||
        !isSafeFrameStorageSegment(publicationId)
      ) {
        return { ...EMPTY_PURGE_RESULT, keptPublicationCount: 1 };
      }

      const descriptor = await loadFramePublicationDescriptor(auth, {
        frame,
        publicationId,
      });
      if (descriptor.isErr()) {
        // A publication whose descriptor cannot be read has no trustworthy age, and an
        // uncommitted one (bundles written, descriptor never was) has none at all. Report it
        // rather than guessing: deleting on a read failure would turn a transient GCS error into
        // data loss.
        logger.warn(
          {
            error: descriptor.error.message,
            frameId: frame.sId,
            publicationId,
            workspaceId: owner.sId,
          },
          "[Frames Retention] Skipped a Frame publication with an unreadable descriptor."
        );

        return { ...EMPTY_PURGE_RESULT, unreadablePublicationCount: 1 };
      }

      if (new Date(descriptor.value.publishedAt) >= cutoffDate) {
        return { ...EMPTY_PURGE_RESULT, keptPublicationCount: 1 };
      }

      const sandboxFunctions =
        await SandboxFunctionResource.listByFramePublication(auth, {
          frame,
          publicationId,
        });
      const invocationCount =
        await SandboxFunctionInvocationResource.countForSandboxFunctions(auth, {
          sandboxFunctions,
        });
      if (invocationCount > 0) {
        return { ...EMPTY_PURGE_RESULT, keptPublicationCount: 1 };
      }

      const deletedFunctionCount =
        await SandboxFunctionResource.deleteAllForFramePublication(auth, {
          frame,
          publicationId,
        });
      // Rows first: a crash here leaves a GCS prefix the next sweep collects, where the reverse
      // would leave rows describing bundles that no longer exist.
      await storage.deleteByPrefix(
        getFramePublicationBasePath({
          workspaceId: owner.sId,
          frameId: frame.sId,
          publicationId,
        })
      );

      logger.info(
        {
          deletedFunctionCount,
          frameId: frame.sId,
          publicationId,
          publishedAt: descriptor.value.publishedAt,
          workspaceId: owner.sId,
        },
        "[Frames Retention] Purged a superseded Frame publication."
      );

      return {
        ...EMPTY_PURGE_RESULT,
        deletedFunctionCount,
        deletedPublicationCount: 1,
      };
    },
    { concurrency: FRAME_PUBLICATION_PURGE_CONCURRENCY }
  );

  return results.reduce(
    (total, result) => ({
      deletedFunctionCount:
        total.deletedFunctionCount + result.deletedFunctionCount,
      deletedPublicationCount:
        total.deletedPublicationCount + result.deletedPublicationCount,
      keptPublicationCount:
        total.keptPublicationCount + result.keptPublicationCount,
      unreadablePublicationCount:
        total.unreadablePublicationCount + result.unreadablePublicationCount,
    }),
    EMPTY_PURGE_RESULT
  );
}
