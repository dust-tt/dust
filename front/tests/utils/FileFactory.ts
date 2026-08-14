import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  AllSupportedFileContentType,
  FileStatus,
  FileUseCase,
  FileUseCaseMetadata,
} from "@app/types/files";

export class FileFactory {
  // We don't support passing a content as GCS has to be mocked in test so the content part can be
  // injected by mocking the GCS client.
  static async create(
    auth: Authenticator,
    user: UserResource | null,
    {
      contentType,
      fileName,
      fileSize,
      status,
      useCase,
      useCaseMetadata = null,
      snippet = null,
      mountFilePath = null,
    }: {
      contentType: AllSupportedFileContentType;
      fileName: string;
      fileSize: number;
      status: FileStatus;
      useCase: FileUseCase;
      useCaseMetadata?: FileUseCaseMetadata | null;
      snippet?: string | null;
      // GCS mount path. Production assigns it while copying the file into its mount; set it here for
      // tests that need the file to have a scoped path (`toScopedPath`).
      mountFilePath?: string | null;
    }
  ) {
    const workspace = await auth.getNonNullableWorkspace();

    const file = await FileResource.makeNew({
      workspaceId: workspace.id,
      userId: user?.id ?? null,
      contentType,
      fileName,
      fileSize,
      useCase,
      useCaseMetadata,
      snippet,
      mountFilePath,
    });

    if (status === "ready") {
      await file.markAsReady(auth);
    } else if (status === "failed") {
      await file.markAsFailed();
    }

    return file;
  }

  static csv(
    auth: Authenticator,
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
    return this.create(auth, user, {
      contentType: "text/csv",
      fileName: fileName ?? "file.csv",
      fileSize: fileSize ?? 100,
      status: status ?? "ready",
      useCase,
      useCaseMetadata,
    });
  }
}
