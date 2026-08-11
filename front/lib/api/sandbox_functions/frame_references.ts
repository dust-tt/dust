import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import { removeNulls } from "@app/types/shared/utils/general";

// Frame contents are read from file storage; keep the fan-out bounded.
const FRAME_SCAN_CONCURRENCY = 4;

/**
 * Best-effort text scan of a pod's frames for references to one of its pod functions.
 *
 * Frames reference a function either by its qualified `<podId>/<slug>` reference or by its sId,
 * always as a string in their source, so a substring scan of each frame's content finds them. For
 * published frames the scanned content is the rendered bundle, which inlines every module of the
 * frame's source tree; for never-published frames it is the entry source only. Computed
 * (dynamically-built) references are missed by design.
 *
 * The result feeds a warning appended to the publish/unpublish tool output and must never block
 * or fail those operations, so any scan failure degrades to an empty result (per-frame read
 * failures simply drop that frame).
 */
export async function listFramePathsReferencingSandboxFunction(
  auth: Authenticator,
  {
    space,
    sandboxFunction,
  }: { space: SpaceResource; sandboxFunction: SandboxFunctionResource }
): Promise<string[]> {
  const needles = [`${space.sId}/${sandboxFunction.slug}`, sandboxFunction.sId];

  try {
    const projectFiles = await FileResource.listByProject(auth, {
      projectId: space.sId,
    });
    const frames = projectFiles.filter(
      (file) =>
        file.contentType === frameContentType ||
        file.contentType === frameSlideshowContentType
    );

    const framePaths = await concurrentExecutor(
      frames,
      async (frame) => {
        // Reads the rendered bundle for published frames, the source otherwise. A failed read
        // returns null and drops the frame from the scan.
        const content = await getFileContent(
          auth,
          frame,
          frame.getRenderableVersion()
        );
        if (
          content === null ||
          !needles.some((needle) => content.includes(needle))
        ) {
          return null;
        }

        return frame.toScopedPath(auth) ?? frame.fileName;
      },
      { concurrency: FRAME_SCAN_CONCURRENCY }
    );

    return removeNulls(framePaths);
  } catch (error) {
    // Warning-only path: a scan failure must not fail the mutation it decorates.
    logger.warn(
      { error, spaceId: space.sId, slug: sandboxFunction.slug },
      "Failed to scan pod frames for sandbox function references"
    );

    return [];
  }
}
