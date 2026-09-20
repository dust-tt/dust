import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system";
import { validateFrameV2Name } from "@app/lib/api/frames/frame_name";
import type { MoveFrameV2SourceError } from "@app/lib/api/frames/move_source";
import { moveFrameV2SourceUsingFileSystem } from "@app/lib/api/frames/move_source";
import { FrameSourceMoveError } from "@app/lib/api/frames/move_source_paths";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type RenameFrameV2Error = MoveFrameV2SourceError;

const renameError = (code: FrameSourceMoveError["code"], message: string) =>
  new Err(new FrameSourceMoveError(code, message));

/**
 * @cc [owner:davidebbo,label:product] frame-rename-never-republishes
 * Renaming a Frame MUST NOT create a publication, rebuild a bundle, or change the share token: a
 * Frame's publications are keyed by its `sId`, never by its path, so the active publication keeps
 * serving across the rename. A rename path that republished would make every rename a deployment.
 */
export async function renameFrameV2(
  auth: Authenticator,
  { frame, newName }: { frame: FileResource; newName: string }
): Promise<Result<{ destinationDirectoryPath: string }, RenameFrameV2Error>> {
  const validated = validateFrameV2Name(newName);
  if (validated.isErr()) {
    return renameError("invalid_source", validated.error);
  }

  const sourceDirectoryPath = frame.getFrameV2SourceDirectoryPath(auth);
  if (!sourceDirectoryPath) {
    return renameError(
      "invalid_source",
      "This Frame has no source folder of its own to rename."
    );
  }

  const destinationDirectoryPath = path.posix.join(
    path.posix.dirname(sourceDirectoryPath),
    validated.value
  );
  if (destinationDirectoryPath === sourceDirectoryPath) {
    return new Ok({ destinationDirectoryPath });
  }

  const oldManifestPath = frame.toScopedPath(auth);
  const fsResult = await DustFileSystem.fromScopedPath(
    auth,
    sourceDirectoryPath
  );
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }

  // `updateMount` refreshes the Frame's name projection from the new path, so the move is the
  // only write needed on the Frame itself.
  const moved = await moveFrameV2SourceUsingFileSystem(auth, {
    dustFs: fsResult.value,
    destinationDirectoryPath,
    sourceDirectoryPath,
  });
  if (moved.isErr()) {
    return moved;
  }

  const podId = frame.useCaseMetadata?.spaceId;
  if (podId && oldManifestPath) {
    await repointPodFrameReferences(auth, {
      podId,
      oldManifestPath,
      newManifestPath: path.posix.join(
        destinationDirectoryPath,
        FRAME_MANIFEST_FILE
      ),
      oldFrameName: path.posix.basename(sourceDirectoryPath),
      newFrameName: validated.value,
    });
  }

  if (moved.value.sourceDeletionFailed) {
    logger.warn(
      { frameId: frame.sId, sourceDirectoryPath },
      "Frame renamed but the old folder could not be removed"
    );
  }

  return new Ok({ destinationDirectoryPath });
}

/**
 * A Pod's pinned Frame and its tabs address a Frame by its manifest path, so they have to follow
 * the rename. Failing here would leave the Frame renamed but a tab dangling, which the Pod UI
 * already renders as a missing tab: log and move on rather than failing a completed rename.
 */
async function repointPodFrameReferences(
  auth: Authenticator,
  {
    podId,
    oldManifestPath,
    newManifestPath,
    oldFrameName,
    newFrameName,
  }: {
    podId: string;
    oldManifestPath: string;
    newManifestPath: string;
    oldFrameName: string;
    newFrameName: string;
  }
): Promise<void> {
  try {
    const [metadata] = await ProjectMetadataResource.fetchBySpaceIds(auth, [
      podId,
    ]);
    if (!metadata) {
      return;
    }
    await metadata.renameFramePath(
      oldManifestPath,
      newManifestPath,
      oldFrameName,
      newFrameName
    );
  } catch (error) {
    logger.warn(
      { error, podId, oldManifestPath, newManifestPath },
      "Frame renamed but its Pod tabs could not be repointed"
    );
  }
}
