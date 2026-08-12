import type { Authenticator } from "@app/lib/auth";
import type { FileSystemRootKind } from "@app/lib/resources/storage/models/file_system_node";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export type FileSystemBindingLocation = {
  rootKind: FileSystemRootKind;
  rootId: string;
  relativePath: string;
  fileName: string;
};

/** Product-object work that the inode tree cannot perform by itself. */
export interface FileSystemFileBinding {
  resolveFileModelId(
    auth: Authenticator,
    fileResourceId: string
  ): Promise<number | null>;

  deleteFile(
    auth: Authenticator,
    fileResourceId: string
  ): Promise<Result<void, Error>>;

  moveFile(
    auth: Authenticator,
    fileResourceId: string,
    location: FileSystemBindingLocation
  ): Promise<Result<void, Error>>;
}

/** Milestone 1 has stable inode identity but no product-object attachment. */
export class UnboundFileSystemFileBinding implements FileSystemFileBinding {
  async resolveFileModelId(): Promise<null> {
    return null;
  }

  async deleteFile(): Promise<Result<void, Error>> {
    return new Ok(undefined);
  }

  async moveFile(): Promise<Result<void, Error>> {
    return new Ok(undefined);
  }
}
