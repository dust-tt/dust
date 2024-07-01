import * as t from "io-ts";

// File upload form validation.

export const FileUploadUrlRequestSchema = t.type({
  contentType: t.string,
  fileName: t.string,
  fileSize: t.number,
  useCase: t.literal("conversation"),
});

export type FileUploadUrlRequestType = t.TypeOf<
  typeof FileUploadUrlRequestSchema
>;

export interface FileRequestResponseBody {
  file: FileType;
}

export const MAX_TEXT_FILE_SIZE = 30 * 1024 * 1024; // 30MB in bytes.

export const MAX_IMAGE_FILE_SIZE = 3 * 1024 * 1024; // 3MB in bytes.

// Supported content types for plain text.
const supportedPlainTextContentTypes = [
  "application/pdf",
  "text/comma-separated-values",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values",
  "text/tsv",
] as const;

// Supported content types for images.
const supportedImageContentTypes = ["image/jpeg", "image/png"] as const;

const supportedUploadableContentType = [
  ...supportedPlainTextContentTypes,
  ...supportedImageContentTypes,
];

// Infer types from the arrays.
type PlainTextContentType = (typeof supportedPlainTextContentTypes)[number];
type ImageContentType = (typeof supportedImageContentTypes)[number];

// Union type for all supported content types.
export type SupportedFileContentType = PlainTextContentType | ImageContentType;

export function isSupportedFileContentType(
  contentType: string
): contentType is SupportedFileContentType {
  return supportedUploadableContentType.includes(
    contentType as SupportedFileContentType
  );
}

export function isSupportedPlainTextContentType(
  contentType: string
): contentType is PlainTextContentType {
  return supportedPlainTextContentTypes.includes(
    contentType as PlainTextContentType
  );
}

export function isSupportedImageContenType(
  contentType: string
): contentType is ImageContentType {
  return supportedImageContentTypes.includes(contentType as ImageContentType);
}

// Types.

export const FILE_ID_PREFIX = "file_";

export type FileId = `${typeof FILE_ID_PREFIX}${string}`;

export type FileStatus = "created" | "failed" | "ready";

export type FileUseCase = "conversation";

export interface FileType {
  contentType: SupportedFileContentType;
  downloadUrl?: string;
  fileName: string;
  fileSize: number;
  id: FileId;
  status: FileStatus;
  uploadUrl?: string;
  useCase: FileUseCase;
}

// Helper functions.

export function isDustFileId(fileId: string): fileId is FileId {
  return fileId.startsWith(FILE_ID_PREFIX);
}
