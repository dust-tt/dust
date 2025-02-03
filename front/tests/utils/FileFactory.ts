import type {
  FileStatus,
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
  WorkspaceType,
} from "@dust-tt/types";

import { FileResource } from "@app/lib/resources/file_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

export class FileFactory {
  // We don't support passing a content as GCS has to be mocked in test so the content part can be
  // injected by mocking the GCS client.
  static async create(
    workspace: WorkspaceType,
    user: UserResource,
    {
      contentType,
      fileName,
      fileSize,
      status,
      useCase,
      useCaseMetadata = null,
      snippet = null,
    }: {
      contentType: SupportedFileContentType;
      fileName: string;
      fileSize: number;
      status: FileStatus;
      useCase: FileUseCase;
      useCaseMetadata?: FileUseCaseMetadata | null;
      snippet?: string | null;
      content?: string | null; // Content to store in GCS
    }
  ) {
    const file = await FileResource.makeNew({
      workspaceId: workspace.id,
      userId: user.id,
      contentType,
      fileName,
      fileSize,
      useCase,
      useCaseMetadata,
      snippet,
    });

    if (status === "ready") {
      await file.markAsReady();
    } else if (status === "failed") {
      await file.markAsFailed();
    }

    return file;
  }
}
