import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system";
import type { MoveFrameV2SourceError } from "@app/lib/api/frames/move_source";
import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import { moveError } from "@app/lib/api/frames/move_source_paths";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { validateFrameV2Name } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type RenameFrameV2Error = MoveFrameV2SourceError;

/**
 * @cc [owner:davidebbo,label:product] frame-rename-never-republishes
 * Renaming a Frame MUST NOT create a publication, rebuild a bundle, or change the share token: a
 * Frame's publications are keyed by its `sId`, never by its path, so the active publication keeps
 * serving across the rename. A rename path that republished would make every rename a deployment.
 */
export async function renameFrameV2(
  auth: Authenticator,
  { frame, newName }: { frame: FileResource; newName: string }
): Promise<Result<{ frame: FileResource }, RenameFrameV2Error>> {
  const validated = validateFrameV2Name(newName);
  if (validated.isErr()) {
    return moveError("invalid_source", validated.error);
  }

  const sourceDirectoryPath = frame.getFrameV2SourceDirectoryPath(auth);
  if (!sourceDirectoryPath) {
    return moveError(
      "invalid_source",
      "This Frame has no source folder of its own to rename."
    );
  }

  // A Frame is named by its folder, so a rename is a move within the same parent.
  const destinationDirectoryPath = path.posix.join(
    path.posix.dirname(sourceDirectoryPath),
    validated.value
  );
  if (destinationDirectoryPath === sourceDirectoryPath) {
    return new Ok({ frame });
  }

  const fsResult = await DustFileSystem.fromScopedPath(
    auth,
    sourceDirectoryPath
  );
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }

  // The move owns everything else: the locks, and repointing the Pod's pinned Frame and tabs at
  // the new path. The Frame's name needs no update — it is derived from the path the move sets.
  const moved = await moveFrameV2Source(auth, {
    dustFs: fsResult.value,
    destinationDirectoryPath,
    sourceDirectoryPath,
  });
  if (moved.isErr()) {
    return moved;
  }

  return new Ok({ frame: moved.value.frame });
}
