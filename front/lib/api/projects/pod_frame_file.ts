import { DustFileSystem } from "@app/lib/api/file_system";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { splitFrameEntryScopedPath } from "@app/lib/api/files/mount_path";
import { moveProjectFile } from "@app/lib/api/projects/context";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import { uploadFrameContent } from "@app/lib/api/viz/upload_frame_content";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { InteractiveContentFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Create a Frame inside a Pod folder from content.
 *
 * There is no primitive for this because every existing path creates a Frame in a conversation and
 * then moves it into the Pod, and the `files` MCP server refuses to copy Frames outright — a Frame
 * copied as a bare GCS object has no FileResource, so it cannot be published or shared and shows up
 * with a null file id. Cloning an app needs a real one.
 *
 * Composed from public steps rather than reaching into FileResource: `uploadContent` claims the Pod
 * mount path, which always lands at the Pod root, so the file is then moved into its folder. The move
 * is what makes the Frame belong to the app, and therefore what makes its bare function references
 * resolve against that app.
 */
/**
 * Publish a Frame that lives in a Pod folder, exactly as the interactive-content tool does: the
 * Frame's own directory is the bundling root, so the bundler resolves its relative imports from the
 * folder it sits in.
 */
export async function publishPodFrameFile(
  auth: Authenticator,
  file: FileResource
): Promise<Result<void, Error>> {
  const scopedPath = file.toScopedPath(auth);
  if (!scopedPath) {
    return new Err(
      new Error(`Frame '${file.sId}' has no Pod path to publish from.`)
    );
  }

  const splitResult = splitFrameEntryScopedPath(scopedPath);
  if (splitResult.isErr()) {
    return new Err(splitResult.error);
  }
  const { root, entryRelPath } = splitResult.value;

  const fsResult = await DustFileSystem.fromScopedPath(auth, root);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }

  const publishResult = await publishFrame(auth, {
    file,
    reader: createMountFrameSourceReader(fsResult.value, root),
    entryRelPath,
    rootScopedPath: root,
  });
  if (publishResult.isErr()) {
    return new Err(new Error(publishResult.error.message));
  }

  return new Ok(undefined);
}

/**
 * The path a Pod file has relative to the Pod's files root, from its canonical scoped path.
 *
 * `moveProjectFile` takes a relative path. It also accepts a scoped one, but only the legacy
 * `pod/...` form — the canonical `pod-{podId}/...` that `toScopedPath` returns is not recognised and
 * would be treated as relative, nesting the scope prefix inside the GCS mount path.
 */
export function podRelativePathFromScopedPath(
  scopedPath: string,
  podId: string
): string | null {
  const podScopePrefix = `${SCOPED_PREFIX_POD}${podId}/`;
  if (!scopedPath.startsWith(podScopePrefix)) {
    return null;
  }

  const relativePath = scopedPath.slice(podScopePrefix.length);

  return relativePath.length > 0 ? relativePath : null;
}

export async function createPodFrameFile(
  auth: Authenticator,
  {
    space,
    folderName,
    fileName,
    contentType,
    content,
  }: {
    space: SpaceResource;
    folderName: string;
    fileName: string;
    contentType: InteractiveContentFileContentType;
    content: string;
  }
): Promise<Result<FileResource, Error>> {
  if (!space.isProject()) {
    return new Err(new Error("Frames can only be created in Pod spaces."));
  }

  try {
    const file = await FileResource.makeNew({
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: auth.user()?.id ?? null,
      fileName,
      contentType,
      // Set when the content is written.
      fileSize: 0,
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    const uploadResult = await uploadFrameContent(auth, file, content);
    if (uploadResult.isErr()) {
      return new Err(new Error(uploadResult.error.message));
    }

    const scopedPath = file.toScopedPath(auth);
    if (!scopedPath) {
      return new Err(
        new Error(`Frame '${fileName}' was created without a Pod path.`)
      );
    }

    // Derived from the path actually claimed, which may be sId-disambiguated if the name was taken.
    const relativePath = podRelativePathFromScopedPath(scopedPath, space.sId);
    if (!relativePath) {
      return new Err(
        new Error(`Frame '${fileName}' landed outside the Pod: ${scopedPath}.`)
      );
    }

    const moveResult = await moveProjectFile(auth, {
      space,
      sourcePath: relativePath,
      destRelativeFilePath: `${folderName}/${fileName}`,
    });
    if (moveResult.isErr()) {
      return new Err(normalizeError(moveResult.error));
    }

    const moved = await FileResource.fetchById(auth, file.sId);
    if (!moved) {
      return new Err(
        new Error(`Frame '${fileName}' disappeared after being moved.`)
      );
    }

    return new Ok(moved);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
