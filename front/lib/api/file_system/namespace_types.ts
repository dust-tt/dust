import type { FileSystemRootKind } from "@app/lib/api/file_system/namespace_scope";
import { z } from "zod";

export type FileSystemNodeKind = "directory" | "file";

const FileSystemRootKinds = [
  "conversation",
  "pod",
] as const satisfies readonly FileSystemRootKind[];
const FileSystemNodeKinds = [
  "directory",
  "file",
] as const satisfies readonly FileSystemNodeKind[];

export const FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS = {
  min: 1,
  max: 256,
} as const;

export const FILE_SYSTEM_NAME_MAX_BYTES = 255;

export const FILE_SYSTEM_MODE_LIMITS = {
  min: 0,
  max: 0o7777,
} as const;

export const FILE_SYSTEM_EXECUTABLE_BITS_MASK = 0o111;

export const FILE_SYSTEM_REQUEST_ID_MAX_LENGTH = 255;

export const FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH = 255;

// Matches the largest raw file upload currently accepted by Dust.
export const FILE_SYSTEM_CONTENT_MAX_BYTES = 350 * 1024 * 1024;

/** The stable file or directory identity returned by the namespace. */
export const FileSystemNodeSchema = z.object({
  id: z.number().int().positive(),
  parentId: z.number().int().positive().nullable(),
  rootKind: z.enum(FileSystemRootKinds),
  rootId: z.string().min(1),
  name: z.string(),
  kind: z.enum(FileSystemNodeKinds),
  mode: z
    .number()
    .int()
    .min(FILE_SYSTEM_MODE_LIMITS.min)
    .max(FILE_SYSTEM_MODE_LIMITS.max),
  size: z.number().int().nonnegative(),
  contentType: z.string().nullable(),
  blobId: z.string().uuid().nullable(),
  contentRevision: z.number().int().nonnegative(),
  createdAtMs: z.number(),
  modifiedAtMs: z.number(),
});

export type FileSystemNodeType = z.infer<typeof FileSystemNodeSchema>;

export type FileSystemContentType = {
  blobId: string | null;
  downloadUrl: string | null;
  size: number;
  contentType: string | null;
};

export type FileSystemContentUploadType = {
  blobId: string;
  uploadUrl: string;
  contentType: string;
  expectedSizeBytes: number;
  headers: Record<string, string>;
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
    }
  | {
      operation: "remove";
      requestId: string;
      parentId: number;
      name: string;
      kind: FileSystemNodeKind;
    }
  | {
      operation: "rename";
      requestId: string;
      sourceParentId: number;
      sourceName: string;
      destinationParentId: number;
      destinationName: string;
    }
  | { operation: "getContent"; nodeId: number }
  | {
      operation: "prepareContentUpload";
      nodeId: number;
      expectedBlobId: string | null;
      expectedSizeBytes: number;
      contentType: string;
    }
  | {
      operation: "commitContentUpload";
      nodeId: number;
      expectedBlobId: string | null;
      blobId: string;
      expectedSizeBytes: number;
      contentType: string;
    }
  | {
      operation: "setExecutableBits";
      nodeId: number;
      /** The exact user, group, and other execute bits to store. */
      executableBits: number;
    };

export type FileSystemOperationResponse = {
  roots?: FileSystemNodeType[];
  node?: FileSystemNodeType | null;
  nodes?: FileSystemNodeType[];
  nextAfterName?: string | null;
  content?: FileSystemContentType;
  upload?: FileSystemContentUploadType;
};

export type FileSystemOperationErrorCode =
  | "already_exists"
  | "invalid_operation"
  | "is_directory"
  | "not_directory"
  | "not_empty"
  | "not_found"
  | "stale"
  | "unauthorized";

export class FileSystemOperationError extends Error {
  constructor(
    readonly code: FileSystemOperationErrorCode,
    message: string
  ) {
    super(message);
  }
}
