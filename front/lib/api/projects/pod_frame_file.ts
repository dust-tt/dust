import { moveProjectFile } from "@app/lib/api/projects/context";
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

    const moveResult = await moveProjectFile(auth, {
      space,
      sourcePath: scopedPath,
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
