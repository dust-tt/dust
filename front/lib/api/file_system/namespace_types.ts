import type { FileSystemRootKind } from "@app/lib/api/file_system/namespace_scope";

export type FileSystemNodeKind = "directory" | "file";

export const FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS = {
  min: 1,
  max: 256,
} as const;

/** The stable file or directory identity returned by the namespace. */
export type FileSystemNode = {
  id: number;
  parentId: number | null;
  rootKind: FileSystemRootKind;
  rootId: string;
  name: string;
  kind: FileSystemNodeKind;
  mode: number;
  size: number;
  contentType: string | null;
  blobId: string | null;
  contentRevision: number;
  createdAtMs: number;
  modifiedAtMs: number;
};

export type FileSystemOperation =
  | { operation: "initialize" }
  | { operation: "lookup"; parentId: number; name: string }
  | { operation: "getAttr"; nodeId: number }
  | {
      operation: "readDir";
      nodeId: number;
      afterName: string | null;
      limit: number;
    };

export type FileSystemOperationResponse = {
  roots?: FileSystemNode[];
  node?: FileSystemNode | null;
  nodes?: FileSystemNode[];
  nextAfterName?: string | null;
};

export type FileSystemOperationErrorCode = "invalid_operation" | "not_found";

export class FileSystemOperationError extends Error {
  constructor(
    readonly code: FileSystemOperationErrorCode,
    message: string
  ) {
    super(message);
  }
}
