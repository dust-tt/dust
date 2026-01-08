import { FileResource } from "@app/lib/resources/file_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  AllSupportedFileContentType,
  FileStatus,
  FileUseCase,
  FileUseCaseMetadata,
  WorkspaceType,
} from "@app/types";

export class FileFactory {
  // We don't support passing a content as GCS has to be mocked in test so the content part can be
  // injected by mocking the GCS client.
  static async create(
    workspace: WorkspaceType,
    user: UserResource | null,
    {
      contentType,
      fileName,
      fileSize,
      status,
      useCase,
      useCaseMetadata = null,
      snippet = null,
    }: {
      contentType: AllSupportedFileContentType;
      fileName: string;
      fileSize: number;
      status: FileStatus;
      useCase: FileUseCase;
      useCaseMetadata?: FileUseCaseMetadata | null;
      snippet?: string | null;
    }
  ) {
    const file = await FileResource.makeNew({
      workspaceId: workspace.id,
      userId: user?.id ?? null,
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

  static csv(
    workspace: WorkspaceType,
    user: UserResource | null,
    {
      useCase,
      useCaseMetadata,
      fileName,
      status,
      fileSize,
    }: {
      useCase: FileUseCase;
      useCaseMetadata?: FileUseCaseMetadata;
      fileName?: string;
      fileSize?: number;
      status?: FileStatus;
    }
  ) {
    return this.create(workspace, user, {
      contentType: "text/csv",
      fileName: fileName ?? "file.csv",
      fileSize: fileSize ?? 100,
      status: status ?? "ready",
      useCase,
      useCaseMetadata,
    });
  }
}
