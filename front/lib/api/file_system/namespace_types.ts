import { z } from "zod";

export const FileSystemRootKindSchema = z.enum(["conversation", "pod"]);
export const FileSystemNodeKindSchema = z.enum(["file", "directory"]);

export type FileSystemNode = {
  id: number;
  parentId: number | null;
  rootKind: z.infer<typeof FileSystemRootKindSchema>;
  rootId: string;
  name: string;
  kind: z.infer<typeof FileSystemNodeKindSchema>;
  mode: number;
  size: number;
  contentType: string | null;
  blobId: string | null;
  contentRevision: number;
  fileResourceId: string | null;
  createdAtMs: number;
  modifiedAtMs: number;
};

const NodeIdSchema = z.number().int().positive();
const NameSchema = z.string().min(1).max(255);

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
  z.object({
    operation: z.literal("attachFileResource"),
    nodeId: NodeIdSchema,
    fileResourceId: z.string().min(1),
  }),
]);

export type FileSystemOperation = z.infer<typeof FileSystemOperationSchema>;

export type FileSystemOperationResponse = {
  roots?: FileSystemNode[];
  node?: FileSystemNode | null;
  nodes?: FileSystemNode[];
  nextAfterName?: string | null;
  content?: {
    blobId: string | null;
    downloadUrl: string | null;
    size: number;
    contentType: string | null;
  };
  upload?: { blobId: string; uploadUrl: string; contentType: string };
  removedNodeId?: number;
  removedFileResourceId?: string | null;
};

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
