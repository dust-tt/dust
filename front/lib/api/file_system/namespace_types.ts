import type { FileSystemRootKind } from "@app/lib/api/file_system/namespace_scope";

export type FileSystemNodeKind = "directory" | "file";

export const FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS = {
  min: 1,
  max: 256,
} as const;

export const FILE_SYSTEM_NAME_MAX_BYTES = 255;

export const FILE_SYSTEM_MODE_LIMITS = {
  min: 0,
  max: 0o7777,
} as const;

export const FILE_SYSTEM_REQUEST_ID_MAX_LENGTH = 255;

/** The stable file or directory identity returned by the namespace. */
export type FileSystemNodeType = {
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
    }
  | {
      operation: "create";
      requestId: string;
      parentId: number;
      name: string;
      kind: FileSystemNodeKind;
      mode: number;
    };

export type FileSystemOperationResponse = {
  roots?: FileSystemNodeType[];
  node?: FileSystemNodeType | null;
  nodes?: FileSystemNodeType[];
  nextAfterName?: string | null;
};

export type FileSystemOperationErrorCode =
  | "already_exists"
  | "invalid_operation"
  | "not_found"
  | "unauthorized";

export class FileSystemOperationError extends Error {
  constructor(
    readonly code: FileSystemOperationErrorCode,
    message: string
  ) {
    super(message);
  }
}
