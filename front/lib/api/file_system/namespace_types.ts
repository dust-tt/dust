import { z } from "zod";

export const FileSystemRootKindSchema = z.enum(["conversation", "pod"]);
export const FileSystemNodeKindSchema = z.enum(["file", "directory"]);

const NodeIdSchema = z.number().int().positive();
const NameSchema = z.string().min(1).max(255);
const FileSystemNodeSchema = z.object({
  id: NodeIdSchema,
  parentId: NodeIdSchema.nullable(),
  rootKind: FileSystemRootKindSchema,
  rootId: z.string().min(1),
  name: z.string(),
  kind: FileSystemNodeKindSchema,
  mode: z.number().int().min(0).max(0o7777),
  size: z.number().int().nonnegative(),
  contentType: z.string().nullable(),
  blobId: z.string().uuid().nullable(),
  contentRevision: z.number().int().nonnegative(),
  // Kept in the internal response while callers migrate; Milestone 1 does
  // not attach product objects to filesystem nodes.
  fileResourceId: z.string().nullable(),
  createdAtMs: z.number(),
  modifiedAtMs: z.number(),
});

export type FileSystemNode = z.infer<typeof FileSystemNodeSchema>;

export const FileSystemOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("initialize") }),
  z.object({
    operation: z.literal("lookup"),
    parentId: NodeIdSchema,
    name: NameSchema,
  }),
  z.object({ operation: z.literal("getAttr"), nodeId: NodeIdSchema }),
  z.object({
    operation: z.literal("readDir"),
    nodeId: NodeIdSchema,
    afterName: z.string().max(255).nullable(),
    limit: z.number().int().min(1).max(256),
  }),
  z.object({
    operation: z.literal("create"),
    // Optional for older local daemon builds. Current builds always send it,
    // making a lost HTTP response safe to retry.
    requestId: z.string().uuid().optional(),
    parentId: NodeIdSchema,
    name: NameSchema,
    kind: FileSystemNodeKindSchema,
    mode: z.number().int().min(0).max(0o7777),
  }),
  z.object({
    operation: z.literal("setAttributes"),
    nodeId: NodeIdSchema,
    mode: z.number().int().min(0).max(0o7777),
  }),
  z.object({ operation: z.literal("getContent"), nodeId: NodeIdSchema }),
  z.object({
    operation: z.literal("prepareContentUpload"),
    nodeId: NodeIdSchema,
    expectedBlobId: z.string().uuid().nullable(),
    contentType: z.string().min(1).max(255),
  }),
  z.object({
    operation: z.literal("commitContentUpload"),
    nodeId: NodeIdSchema,
    expectedBlobId: z.string().uuid().nullable(),
    blobId: z.string().uuid(),
    contentType: z.string().min(1).max(255),
  }),
  z.object({
    operation: z.literal("remove"),
    requestId: z.string().uuid(),
    parentId: NodeIdSchema,
    name: NameSchema,
  }),
  z.object({
    operation: z.literal("rename"),
    requestId: z.string().uuid(),
    parentId: NodeIdSchema,
    name: NameSchema,
    newParentId: NodeIdSchema,
    newName: NameSchema,
  }),
]);

export type FileSystemOperation = z.infer<typeof FileSystemOperationSchema>;

export const FileSystemOperationResponseSchema = z.object({
  roots: z.array(FileSystemNodeSchema).optional(),
  node: FileSystemNodeSchema.nullable().optional(),
  nodes: z.array(FileSystemNodeSchema).optional(),
  nextAfterName: z.string().nullable().optional(),
  content: z
    .object({
      blobId: z.string().uuid().nullable(),
      downloadUrl: z.string().nullable(),
      size: z.number().int().nonnegative(),
      contentType: z.string().nullable(),
    })
    .optional(),
  upload: z
    .object({
      blobId: z.string().uuid(),
      uploadUrl: z.string(),
      contentType: z.string(),
    })
    .optional(),
  removedNodeId: NodeIdSchema.optional(),
  // Kept for response compatibility; the database filesystem always returns null.
  removedFileResourceId: z.string().nullable().optional(),
});

export type FileSystemOperationResponse = z.infer<
  typeof FileSystemOperationResponseSchema
>;

export type FileSystemOperationErrorCode =
  | "already_exists"
  | "busy"
  | "invalid_operation"
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
