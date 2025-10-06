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
  isContentCreation: z.boolean(),
});

type SetErrorMessageParams = z.infer<typeof SetErrorMessageParamsSchema>;

// Define Zod schemas for each RPC request type.
const GetFileRequestSchema = VisualizationRPCRequestBaseSchema.extend({
  command: z.literal("getFile"),
  params: GetFileParamsSchema,
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

const VisualizationRPCRequestSchema = z.union([
  GetFileRequestSchema,
  GetCodeToExecuteRequestSchema,
  SetContentHeightRequestSchema,
  SetErrorMessageRequestSchema,
  DownloadFileRequestSchema,
  DisplayCodeRequestSchema,
]);

// Derive types from Zod schemas.
export type VisualizationRPCRequest = z.infer<
  typeof VisualizationRPCRequestSchema
>;
export type VisualizationRPCCommand = VisualizationRPCRequest["command"];

// Define a mapped type for backward compatibility.
export type VisualizationRPCRequestMap = {
  getFile: GetFileParams;
  getCodeToExecute: null;
  setContentHeight: SetContentHeightParams;
  setErrorMessage: SetErrorMessageParams;
  downloadFileRequest: DownloadFileRequestParams;
  displayCode: null;
};

// Command results.
export interface CommandResultMap {
  getCodeToExecute: { code: string };
  getFile: { fileBlob: Blob | null };
  downloadFileRequest: { blob: Blob; filename?: string };
  setContentHeight: void;
  setErrorMessage: void;
  displayCode: void;
}

// Zod-based type guards.
export function isGetFileRequest(
  value: unknown
): value is z.infer<typeof GetFileRequestSchema> {
  return GetFileRequestSchema.safeParse(value).success;
}

export function isGetCodeToExecuteRequest(
  value: unknown
): value is z.infer<typeof GetCodeToExecuteRequestSchema> {
  return GetCodeToExecuteRequestSchema.safeParse(value).success;
}

export function isSetContentHeightRequest(
  value: unknown
): value is z.infer<typeof SetContentHeightRequestSchema> {
  return SetContentHeightRequestSchema.safeParse(value).success;
}

export function isSetErrorMessageRequest(
  value: unknown
): value is z.infer<typeof SetErrorMessageRequestSchema> {
  return SetErrorMessageRequestSchema.safeParse(value).success;
}

export function isDownloadFileRequest(
  value: unknown
): value is z.infer<typeof DownloadFileRequestSchema> {
  return DownloadFileRequestSchema.safeParse(value).success;
}

export function isDisplayCodeRequest(
  value: unknown
): value is z.infer<typeof DisplayCodeRequestSchema> {
  return DisplayCodeRequestSchema.safeParse(value).success;
}

export function isVisualizationRPCRequest(
  value: unknown
): value is VisualizationRPCRequest {
  return VisualizationRPCRequestSchema.safeParse(value).success;
}
