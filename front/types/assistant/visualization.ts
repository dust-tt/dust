import { z } from "zod";

// This defines the commands that the iframe can send to the host window.

// Common base schema.
const VisualizationRPCRequestBaseSchema = z.object({
  identifier: z.string(),
  messageUniqueId: z.string(),
});

// Define parameter schemas for each command.

const GetFileParamsSchema = z.object({
  fileId: z.string(),
});

type GetFileParams = z.infer<typeof GetFileParamsSchema>;

const CallFunctionParamsSchema = z.object({
  functionIdOrSlug: z.string(),
  input: z.unknown().optional(),
});

type CallFunctionParams = z.infer<typeof CallFunctionParamsSchema>;

export interface WorkspaceUserIdentity {
  sId: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  image: string | null;
}

export type UserIdentityState =
  | {
      isAuthenticated: true;
      isWorkspaceMember: true;
      // Whether the viewer is an editor of the Pod hosting the Frame. Display-only: functions
      // resolve the caller server-side, never from what the Frame sends.
      isPodEditor: boolean;
      // Whether the viewer belongs to one of the Pod's groups (member or editor). Display-only,
      // like isPodEditor: gate what the Frame shows, never what the server allows.
      isPodMember: boolean;
      // Whether the viewer can modify the source files backing this Frame v2. Display-only: use
      // frame_author_required to enforce the same capability on a server-side function.
      isFrameAuthor: boolean;
      user: WorkspaceUserIdentity;
    }
  | {
      isAuthenticated: false;
      isWorkspaceMember: false;
      isPodEditor: false;
      isPodMember: false;
      isFrameAuthor: false;
      user: null;
    };

export interface ScopedWorkspaceUserIdentity {
  workspaceId: string;
  // Optional: only hosts rendering inside a pod know editorship and membership; absent means
  // false.
  isPodEditor?: boolean;
  isPodMember?: boolean;
  user: WorkspaceUserIdentity;
}

const SetContentHeightParamsSchema = z.object({
  height: z.number(),
});

type SetContentHeightParams = z.infer<typeof SetContentHeightParamsSchema>;

const DownloadFileRequestParamsSchema = z.object({
  blob: z.instanceof(Blob),
  filename: z.string().optional(),
});

type DownloadFileRequestParams = z.infer<
  typeof DownloadFileRequestParamsSchema
>;

const SetErrorMessageParamsSchema = z.object({
  errorMessage: z.string(),
  fileId: z.string(),
  isInteractiveContent: z.boolean(),
});

type SetErrorMessageParams = z.infer<typeof SetErrorMessageParamsSchema>;

// Define Zod schemas for each RPC request type.
const GetFileRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("getFile"),
  params: GetFileParamsSchema,
});

const CallFunctionRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("callFunction"),
  params: CallFunctionParamsSchema,
});

const GetUserIdentityRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("getUserIdentity"),
  params: z.null(),
});

const GetCodeToExecuteRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("getCodeToExecute"),
  params: z.null(),
});

const SetContentHeightRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("setContentHeight"),
  params: SetContentHeightParamsSchema,
});

const SetErrorMessageRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("setErrorMessage"),
  params: SetErrorMessageParamsSchema,
});

const DownloadFileRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("downloadFileRequest"),
  params: DownloadFileRequestParamsSchema,
});

const DisplayCodeRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("displayCode"),
  params: z.null(),
});

const EditTextParamsSchema = z.object({
  newText: z.string(),
  oldText: z.string(),
  targetFileId: z.string().optional(),
  // When set, the edit is routed back to the source by location: the value is the clicked
  // element's `data-source` ("<relPath>:<line>:<col>") from a published (bundled) Frame, and
  // oldText/newText are the visible (trimmed) text. Absent for legacy context-match edits.
  source: z.string().optional(),
});

type EditTextParams = z.infer<typeof EditTextParamsSchema>;

export type EditTextFn = (
  params: EditTextParams
) => Promise<{ success: boolean; error?: string }>;

const EditTextRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("editText"),
  params: EditTextParamsSchema,
});

const VisualizationRPCRequestSchema = z.union([
  CallFunctionRequestSchema,
  GetUserIdentityRequestSchema,
  GetFileRequestSchema,
  GetCodeToExecuteRequestSchema,
  SetContentHeightRequestSchema,
  SetErrorMessageRequestSchema,
  DownloadFileRequestSchema,
  DisplayCodeRequestSchema,
  EditTextRequestSchema,
]);

// Derive types from Zod schemas.
export type VisualizationRPCRequest = z.infer<
  typeof VisualizationRPCRequestSchema
>;
export type CallFunctionRequest = z.infer<typeof CallFunctionRequestSchema>;
export type VisualizationRPCCommand = VisualizationRPCRequest["command"];

// Define a mapped type for backward compatibility.
export type VisualizationRPCRequestMap = {
  callFunction: CallFunctionParams;
  getUserIdentity: null;
  getFile: GetFileParams;
  getCodeToExecute: null;
  setContentHeight: SetContentHeightParams;
  setErrorMessage: SetErrorMessageParams;
  downloadFileRequest: DownloadFileRequestParams;
  displayCode: null;
  editText: EditTextParams;
};

// Command results.
export interface CommandResultMap {
  callFunction: unknown;
  getUserIdentity: UserIdentityState;
  getCodeToExecute: { code: string };
  getFile: { fileBlob: Blob | null };
  downloadFileRequest: { blob: Blob; filename?: string };
  setContentHeight: void;
  setErrorMessage: void;
  displayCode: void;
  editText: { success: boolean; error?: string };
}

export function isVisualizationRPCRequest(
  value: unknown
): value is VisualizationRPCRequest {
  return VisualizationRPCRequestSchema.safeParse(value).success;
}
