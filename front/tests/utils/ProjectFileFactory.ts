import type { Authenticator } from "@app/lib/auth";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AllSupportedFileContentType, FileStatus } from "@app/types/files";

import { FileFactory } from "./FileFactory";

type ProjectFileCreateOptions = {
  contentType: AllSupportedFileContentType;
  fileName: string;
  fileSize: number;
  status: FileStatus;
  snippet?: string | null;
};

export class ProjectFileFactory {
  /**
   * Creates a project-context file and ensures the corresponding latest
   * `content_fragments` row exists so project endpoints can list it.
   */
  static async create(
    auth: Authenticator,
    user: UserResource | null,
    space: SpaceResource,
    {
      contentType,
      fileName,
      fileSize,
      status,
      snippet = null,
    }: ProjectFileCreateOptions
  ): Promise<FileResource> {
    const file = await FileFactory.create(auth, user, {
      contentType,
      fileName,
      fileSize,
      status,
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      snippet,
    });

    // Project content fragments are only created for ready project-context files.
    if (file.isReady) {
      const fragmentRes =
        await ContentFragmentResource.upsertLatestProjectFileFragment(
          auth,
          space,
          file
        );

      if (fragmentRes.isErr()) {
        throw new Error(
          `Failed to upsert latest project content fragment: ${fragmentRes.error.message}`
        );
      }
    }

    return file;
  }
}
