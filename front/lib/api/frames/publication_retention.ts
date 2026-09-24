import { loadFramePublicationDescriptor } from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  getFramePublicationBasePath,
  getFramePublicationsBasePath,
  isSafeFrameStorageSegment,
} from "@app/types/api/frame_storage";
import assert from "assert";

const FRAME_PUBLICATION_PURGE_CONCURRENCY = 4;

export type StaleFramePublicationPurgeResult = {
  deletedFunctionCount: number;
  deletedPublicationCount: number;
  unreadablePublicationCount: number;
};

type PublicationOutcome =
  | { outcome: "kept" }
  | { outcome: "unreadable" }
  | { outcome: "stale"; publicationId: string; publishedAt: string };

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
 * Delete the superseded publications of one Frame: their function rows, their `frame_publications`
 * row and their whole GCS prefix. Publications are enumerated from storage rather than from
 * `sandbox_functions`, because a publication that declares no function leaves no row behind to
 * find it by.
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
  assert(
    frame.isFrameV2 && frame.workspaceId === owner.id,
    "Publication retention requires a Frames v2 file of the auth's workspace."
  );

  const storage = getPrivateUploadBucket();
  const publicationIds = await storage.listSubdirectoryNames({
    prefix: getFramePublicationsBasePath({
      workspaceId: owner.sId,
      frameId: frame.sId,
    }),
  });

  const activePublicationId = frame.useCaseMetadata?.activePublicationId;
  const cutoffDate = new Date(Date.now() - retentionMs);
  const logContext = { frameId: frame.sId, workspaceId: owner.sId };

  const outcomes = await concurrentExecutor(
    publicationIds,
    async (publicationId): Promise<PublicationOutcome> => {
      if (publicationId === activePublicationId) {
        return { outcome: "kept" };
      }

      // Publication ids are UUIDs we wrote ourselves, so anything else under the prefix is
      // foreign data the path builders would refuse: report it rather than touch it.
      if (!isSafeFrameStorageSegment(publicationId)) {
        logger.warn(
          { ...logContext, publicationId },
          "[Frames Retention] Skipped a Frame publication directory with an unsafe name."
        );

        return { outcome: "unreadable" };
      }

      // The indexed DB check comes before the GCS descriptor read: a superseded publication whose
      // runs are still on record is kept on every daily run until its invocations expire.
      const invocationCount =
        await SandboxFunctionInvocationResource.countForFramePublication(auth, {
          frame,
          publicationId,
        });
      if (invocationCount > 0) {
        return { outcome: "kept" };
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
          { ...logContext, error: descriptor.error.message, publicationId },
          "[Frames Retention] Skipped a Frame publication with an unreadable descriptor."
        );

        return { outcome: "unreadable" };
      }

      if (new Date(descriptor.value.publishedAt) >= cutoffDate) {
        return { outcome: "kept" };
      }

      return {
        outcome: "stale",
        publicationId,
        publishedAt: descriptor.value.publishedAt,
      };
    },
    { concurrency: FRAME_PUBLICATION_PURGE_CONCURRENCY }
  );

  const stalePublications = outcomes.filter(
    (o): o is Extract<PublicationOutcome, { outcome: "stale" }> =>
      o.outcome === "stale"
  );
  const unreadablePublicationCount = outcomes.filter(
    (o) => o.outcome === "unreadable"
  ).length;
  if (stalePublications.length === 0) {
    return {
      deletedFunctionCount: 0,
      deletedPublicationCount: 0,
      unreadablePublicationCount,
    };
  }

  // Rows first: a crash between the rows and the GCS deletes leaves GCS prefixes the next sweep
  // collects, where the reverse would leave rows describing bundles that no longer exist.
  const stalePublicationIds = stalePublications.map(
    ({ publicationId }) => publicationId
  );
  const deletedFunctionCount =
    await SandboxFunctionResource.deleteAllForFramePublications(auth, {
      frame,
      publicationIds: stalePublicationIds,
    });
  await FramePublicationResource.deleteForFramePublications(auth, {
    frame,
    publicationIds: stalePublicationIds,
  });
  await concurrentExecutor(
    stalePublications,
    async ({ publicationId, publishedAt }) => {
      await storage.deleteByPrefix(
        getFramePublicationBasePath({
          workspaceId: owner.sId,
          frameId: frame.sId,
          publicationId,
        })
      );

      logger.info(
        { ...logContext, publicationId, publishedAt },
        "[Frames Retention] Purged a superseded Frame publication."
      );
    },
    { concurrency: FRAME_PUBLICATION_PURGE_CONCURRENCY }
  );

  return {
    deletedFunctionCount,
    deletedPublicationCount: stalePublications.length,
    unreadablePublicationCount,
  };
}
