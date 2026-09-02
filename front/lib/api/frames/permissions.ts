import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";

/**
 * Whether the authenticated user can modify the source files backing a Frame v2.
 *
 * The file system owns this decision: conversation access and Pod write access are
 * resolved from the Frame's canonical scoped source path.
 */
export async function canWriteFrameV2Source(
  auth: Authenticator,
  frame: FileResource
): Promise<boolean> {
  const user = auth.user();
  const workspace = auth.getNonNullableWorkspace();
  if (!user || !frame.isFrameV2 || frame.workspaceId !== workspace.id) {
    return false;
  }

  const sourcePath = frame.toScopedPath(auth);
  if (!sourcePath) {
    return false;
  }

  const fileSystemResult = await DustFileSystem.fromScopedPath(
    auth,
    sourcePath
  );
  if (fileSystemResult.isErr()) {
    return false;
  }

  return fileSystemResult.value.checkWriteAccess(sourcePath).isOk();
}
