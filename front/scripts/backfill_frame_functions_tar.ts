import {
  buildFrameFunctionsTarArchive,
  FRAME_FUNCTIONS_ARCHIVE_CONTENT_TYPE,
} from "@app/lib/api/frames/functions_archive";
import { loadFramePublicationDescriptor } from "@app/lib/api/frames/publication_storage";
import { Authenticator } from "@app/lib/auth";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import {
  isGCSNotFoundError,
  isGCSPreconditionFailedError,
} from "@app/lib/file_storage/types";
import { FileResource } from "@app/lib/resources/file_resource";
import { computeSandboxFunctionBundleSha256 } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import {
  getFramePublicationBasePath,
  getFramePublicationFunctionsArchivePath,
  isSafeFrameStorageSegment,
} from "@app/types/api/frame_storage";
import type { ModelId } from "@app/types/shared/model_id";

/**
 * Backfill `functions.tar` for Frames v2 whose active publication still only has
 * the legacy per-function `functions/<slug>.ts` objects.
 *
 * Discovers candidate workspaces/frames from `sandbox_functions` (not a full
 * workspace scan). Dry-run by default. Pass `--execute` to upload.
 *
 *   npx tsx scripts/backfill_frame_functions_tar.ts
 *   npx tsx scripts/backfill_frame_functions_tar.ts --execute
 */

const CONCURRENCY_DEFAULT = 4;

/** Legacy layout: one object per slug next to where `functions.tar` now lives. */
function getLegacyFramePublicationFunctionBundlePath({
  workspaceId,
  frameId,
  publicationId,
  functionName,
}: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
  functionName: string;
}): string {
  if (!isSafeFrameStorageSegment(functionName)) {
    throw new Error(`Invalid functionName for Frame storage: ${functionName}`);
  }
  return `${getFramePublicationBasePath({ workspaceId, frameId, publicationId })}functions/${functionName}.ts`;
}

makeScript(
  {
    concurrency: {
      type: "number",
      default: CONCURRENCY_DEFAULT,
      describe: "Concurrent Frames processed per workspace.",
    },
  },
  async ({ execute, concurrency }, scriptLogger) => {
    const candidateRows = (await SandboxFunctionModel.findAll({
      attributes: ["fileId", "workspaceId"],
      group: ["fileId", "workspaceId"],
      // @ts-expect-error
      // WORKSPACE_ISOLATION_BYPASS: Discovery query across workspaces that own Frame functions.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      raw: true,
    })) as unknown as { fileId: ModelId; workspaceId: ModelId }[];

    const fileIdsByWorkspaceId = new Map<ModelId, ModelId[]>();
    for (const { fileId, workspaceId } of candidateRows) {
      const fileIds = fileIdsByWorkspaceId.get(workspaceId) ?? [];
      fileIds.push(fileId);
      fileIdsByWorkspaceId.set(workspaceId, fileIds);
    }

    const workspaces = (
      await WorkspaceResource.fetchByModelIds([...fileIdsByWorkspaceId.keys()])
    ).map((workspace) => renderLightWorkspaceType({ workspace }));

    scriptLogger.info(
      {
        workspaceCount: workspaces.length,
        frameCount: candidateRows.length,
        execute,
      },
      "[backfill_frame_functions_tar] Starting"
    );

    const bucket = getPrivateUploadBucket();

    for (const workspace of workspaces) {
      const workspaceId = workspace.sId;
      const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
      const fileIds = fileIdsByWorkspaceId.get(workspace.id) ?? [];

      const frames = await FileResource.fetchByModelIdsWithAuth(auth, fileIds);
      const framesById = new Map(frames.map((frame) => [frame.id, frame]));

      let totalSeen = 0;
      let uploaded = 0;
      let alreadyPresent = 0;
      let skipped = 0;
      let errors = 0;

      scriptLogger.info(
        { workspaceId, frameCount: fileIds.length, execute },
        "[backfill_frame_functions_tar] Starting workspace"
      );

      await concurrentExecutor(
        fileIds,
        async (fileId) => {
          totalSeen++;
          const frame = framesById.get(fileId);
          if (!frame?.isFrameV2) {
            skipped++;
            scriptLogger.warn(
              { workspaceId, fileId },
              "[backfill_frame_functions_tar] Skipping: file missing or not Frames v2"
            );
            return;
          }

          const publicationId =
            frame.useCaseMetadata?.activePublicationId ?? null;
          if (!publicationId) {
            skipped++;
            scriptLogger.info(
              { workspaceId, frameId: frame.sId },
              "[backfill_frame_functions_tar] Skipping: no activePublicationId"
            );
            return;
          }

          const identity = {
            workspaceId,
            frameId: frame.sId,
            publicationId,
          };
          const archivePath = getFramePublicationFunctionsArchivePath(identity);

          const [archiveExists] = await bucket.file(archivePath).exists();
          if (archiveExists) {
            alreadyPresent++;
            return;
          }

          const activeFunctions = await SandboxFunctionModel.findAll({
            attributes: ["slug"],
            where: {
              workspaceId: workspace.id,
              fileId: frame.id,
              publicationId,
            },
            order: [["slug", "ASC"]],
            raw: true,
          });

          if (activeFunctions.length === 0) {
            skipped++;
            scriptLogger.info(
              { workspaceId, frameId: frame.sId, publicationId },
              "[backfill_frame_functions_tar] Skipping: active publication has no sandbox_functions rows"
            );
            return;
          }

          const descriptor = await loadFramePublicationDescriptor(auth, {
            frame,
            publicationId,
          });
          if (descriptor.isErr()) {
            errors++;
            scriptLogger.error(
              {
                workspaceId,
                frameId: frame.sId,
                publicationId,
                error: descriptor.error.message,
              },
              "[backfill_frame_functions_tar] Failed to load publication descriptor"
            );
            return;
          }

          const expectedHashes = new Map(
            descriptor.value.functions.map((fn) => [fn.name, fn.bundleSha256])
          );

          const entries: Array<{ name: string; content: string }> = [];
          for (const { slug } of activeFunctions) {
            const expectedHash = expectedHashes.get(slug);
            if (!expectedHash) {
              errors++;
              scriptLogger.error(
                {
                  workspaceId,
                  frameId: frame.sId,
                  publicationId,
                  slug,
                },
                "[backfill_frame_functions_tar] sandbox_functions slug missing from publication.json"
              );
              return;
            }

            const legacyPath = getLegacyFramePublicationFunctionBundlePath({
              ...identity,
              functionName: slug,
            });

            let content: string;
            try {
              const buffer = await bucket.fetchFileBuffer(legacyPath);
              content = Buffer.from(buffer).toString("utf8");
            } catch (error) {
              errors++;
              scriptLogger.error(
                {
                  workspaceId,
                  frameId: frame.sId,
                  publicationId,
                  slug,
                  legacyPath,
                  error: isGCSNotFoundError(error)
                    ? "not_found"
                    : error instanceof Error
                      ? error.message
                      : String(error),
                },
                "[backfill_frame_functions_tar] Failed to read legacy function bundle"
              );
              return;
            }

            const actualHash = computeSandboxFunctionBundleSha256(content);
            if (actualHash !== expectedHash) {
              errors++;
              scriptLogger.error(
                {
                  workspaceId,
                  frameId: frame.sId,
                  publicationId,
                  slug,
                  expectedHash,
                  actualHash,
                },
                "[backfill_frame_functions_tar] Legacy bundle hash mismatch"
              );
              return;
            }

            entries.push({ name: slug, content });
          }

          if (entries.length !== expectedHashes.size) {
            errors++;
            scriptLogger.error(
              {
                workspaceId,
                frameId: frame.sId,
                publicationId,
                sandboxFunctionCount: entries.length,
                descriptorFunctionCount: expectedHashes.size,
              },
              "[backfill_frame_functions_tar] sandbox_functions count does not match publication.json"
            );
            return;
          }

          scriptLogger.info(
            {
              workspaceId,
              frameId: frame.sId,
              publicationId,
              functionCount: entries.length,
              archivePath,
            },
            execute
              ? "[backfill_frame_functions_tar] Uploading functions.tar"
              : "[backfill_frame_functions_tar] Would upload functions.tar (dry-run)"
          );

          if (!execute) {
            uploaded++;
            return;
          }

          try {
            const archive = await buildFrameFunctionsTarArchive(entries);
            await bucket.file(archivePath).save(archive, {
              contentType: FRAME_FUNCTIONS_ARCHIVE_CONTENT_TYPE,
              preconditionOpts: {
                ifGenerationMatch: GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
              },
            });
            uploaded++;
          } catch (error) {
            if (isGCSPreconditionFailedError(error)) {
              // A concurrent writer (or a previous partial run) already created the object.
              alreadyPresent++;
              scriptLogger.info(
                {
                  workspaceId,
                  frameId: frame.sId,
                  publicationId,
                  archivePath,
                },
                "[backfill_frame_functions_tar] Archive appeared concurrently; treating as present"
              );
              return;
            }
            errors++;
            scriptLogger.error(
              {
                workspaceId,
                frameId: frame.sId,
                publicationId,
                archivePath,
                error: error instanceof Error ? error.message : String(error),
              },
              "[backfill_frame_functions_tar] Failed to upload functions.tar"
            );
          }
        },
        { concurrency }
      );

      scriptLogger.info(
        {
          workspaceId,
          totalSeen,
          uploaded,
          alreadyPresent,
          skipped,
          errors,
          execute,
        },
        "[backfill_frame_functions_tar] Workspace done"
      );
    }
  }
);
