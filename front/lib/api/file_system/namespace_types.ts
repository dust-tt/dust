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

export const FileSystemContentSchema = z.object({
  blobId: z.string().uuid().nullable(),
  downloadUrl: z.string().nullable(),
  size: z.number().int().nonnegative(),
  contentType: z.string().nullable(),
});

export type FileSystemContentType = z.infer<typeof FileSystemContentSchema>;

export const FileSystemContentUploadSchema = z.object({
  blobId: z.string().uuid(),
  uploadUrl: z.string(),
  contentType: z.string(),
  expectedSizeBytes: z.number().int().nonnegative(),
  headers: z.record(z.string(), z.string()),
});

export type FileSystemContentUploadType = z.infer<
  typeof FileSystemContentUploadSchema
>;

const FileSystemNodeIdSchema = z.number().int().positive();
const FileSystemNameSchema = z.string().min(1).max(FILE_SYSTEM_NAME_MAX_BYTES);
const FileSystemRequestIdSchema = z
  .string()
  .min(1)
  .max(FILE_SYSTEM_REQUEST_ID_MAX_LENGTH);
const FileSystemModeSchema = z
  .number()
  .int()
  .min(FILE_SYSTEM_MODE_LIMITS.min)
  .max(FILE_SYSTEM_MODE_LIMITS.max);
const FileSystemContentTypeSchema = z
  .string()
  .min(1)
  .max(FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH);
const FileSystemContentSizeSchema = z
  .number()
  .int()
  .min(0)
  .max(FILE_SYSTEM_CONTENT_MAX_BYTES);

export const FileSystemOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("initialize") }),
  z.object({
    operation: z.literal("lookup"),
    parentId: FileSystemNodeIdSchema,
    name: FileSystemNameSchema,
  }),
  z.object({
    operation: z.literal("getAttr"),
    nodeId: FileSystemNodeIdSchema,
  }),
  z.object({
    operation: z.literal("readDir"),
    nodeId: FileSystemNodeIdSchema,
    afterName: z.string().max(FILE_SYSTEM_NAME_MAX_BYTES).nullable(),
    limit: z
      .number()
      .int()
      .min(FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.min)
      .max(FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.max),
  }),
  z.object({
    operation: z.literal("create"),
    requestId: FileSystemRequestIdSchema,
    parentId: FileSystemNodeIdSchema,
    name: FileSystemNameSchema,
    kind: z.enum(FileSystemNodeKinds),
    mode: FileSystemModeSchema,
  }),
  z.object({
    operation: z.literal("remove"),
    requestId: FileSystemRequestIdSchema,
    parentId: FileSystemNodeIdSchema,
    name: FileSystemNameSchema,
    kind: z.enum(FileSystemNodeKinds),
  }),
  z.object({
    operation: z.literal("rename"),
    requestId: FileSystemRequestIdSchema,
    sourceParentId: FileSystemNodeIdSchema,
    sourceName: FileSystemNameSchema,
    destinationParentId: FileSystemNodeIdSchema,
    destinationName: FileSystemNameSchema,
  }),
  z.object({
    operation: z.literal("getContent"),
    nodeId: FileSystemNodeIdSchema,
  }),
  z.object({
    operation: z.literal("prepareContentUpload"),
    nodeId: FileSystemNodeIdSchema,
    expectedBlobId: z.string().uuid().nullable(),
    expectedSizeBytes: FileSystemContentSizeSchema,
    contentType: FileSystemContentTypeSchema,
  }),
  z.object({
    operation: z.literal("commitContentUpload"),
    nodeId: FileSystemNodeIdSchema,
    expectedBlobId: z.string().uuid().nullable(),
    blobId: z.string().uuid(),
    expectedSizeBytes: FileSystemContentSizeSchema,
    contentType: FileSystemContentTypeSchema,
  }),
  z.object({
    operation: z.literal("setExecutableBits"),
    nodeId: FileSystemNodeIdSchema,
    // Only these three bits may be sent. Read and write bits stay unchanged.
    executableBits: z
      .number()
      .int()
      .refine(
        (bits) => bits >= 0 && (bits & ~FILE_SYSTEM_EXECUTABLE_BITS_MASK) === 0,
        "Only user, group, and other executable bits can be changed."
      ),
  }),
]);

export type FileSystemOperation = z.infer<typeof FileSystemOperationSchema>;

export const FileSystemOperationResponseSchema = z.object({
  roots: z.array(FileSystemNodeSchema).optional(),
  node: FileSystemNodeSchema.nullable().optional(),
  removedNodeId: FileSystemNodeIdSchema.optional(),
  replacedNodeId: FileSystemNodeIdSchema.nullable().optional(),
  nodes: z.array(FileSystemNodeSchema).optional(),
  nextAfterName: z.string().nullable().optional(),
  content: FileSystemContentSchema.optional(),
  upload: FileSystemContentUploadSchema.optional(),
});

export type FileSystemOperationResponse = z.infer<
  typeof FileSystemOperationResponseSchema
>;

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
