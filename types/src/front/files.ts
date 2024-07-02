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

// Define max sizes for each category.
const MAX_SIZES: Record<"plainText" | "image", number> = {
  plainText: 30 * 1024 * 1024, // 30MB.
  image: 3 * 1024 * 1024, // 3 MB
};

// Function to ensure file size is within max limit for given content type.
export function ensureFileSize(
  contentType: SupportedFileContentType,
  fileSize: number
): boolean {
  if (isSupportedPlainTextContentType(contentType)) {
    return fileSize <= MAX_SIZES.plainText;
  }

  if (isSupportedImageContenType(contentType)) {
    return fileSize <= MAX_SIZES.image;
  }

  return false;
}

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

export type FileStatus = "created" | "failed" | "ready";

export type FileUseCase = "conversation";

export interface FileType {
  contentType: SupportedFileContentType;
  downloadUrl?: string;
  fileName: string;
  fileSize: number;
  id: string;
  status: FileStatus;
  uploadUrl?: string;
  useCase: FileUseCase;
}
