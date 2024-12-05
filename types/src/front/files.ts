import * as t from "io-ts";

// File upload form validation.

export const FileUploadUrlRequestSchema = t.type({
  contentType: t.string,
  fileName: t.string,
  fileSize: t.number,
  useCase: t.union([
    t.literal("conversation"),
    t.literal("avatar"),
    t.literal("folder_document"),
    t.literal("folder_table"),
  ]),
  useCaseMetadata: t.union([t.undefined, t.type({ conversationId: t.string })]),
});

export type FileUploadUrlRequestType = t.TypeOf<
  typeof FileUploadUrlRequestSchema
>;

export interface FileUploadRequestResponseBody {
  file: FileTypeWithUploadUrl;
}

export interface FileUploadedRequestResponseBody {
  file: FileType;
}

// Define max sizes for each category.
export const MAX_FILE_SIZES: Record<"plainText" | "image", number> = {
  plainText: 30 * 1024 * 1024, // 30MB.
  image: 5 * 1024 * 1024, // 5 MB
};

export function maxFileSizeToHumanReadable(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${size / 1024} KB`;
  }

  return `${size / (1024 * 1024)} MB`;
}

export const MAX_FILE_LENGTH = 50_000_000;
export const BIG_FILE_SIZE = 5_000_000;

// Function to ensure file size is within max limit for given content type.
export function ensureFileSize(
  contentType: SupportedFileContentType,
  fileSize: number
): boolean {
  if (isSupportedPlainTextContentType(contentType)) {
    return fileSize <= MAX_FILE_SIZES.plainText;
  }

  if (isSupportedImageContentType(contentType)) {
    return fileSize <= MAX_FILE_SIZES.image;
  }

  return false;
}

// NOTE: if we add more content types, we need to update the public api package.
const supportedDelimitedText = {
  "text/comma-separated-values": [".csv"],
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "text/tsv": [".tsv"],
} as const;

// Supported content types that are plain text and can be sent as file-less content fragment.
const supportedRawText = {
  "text/markdown": [".md", ".markdown"],
  "text/plain": [".txt"],
  "text/vnd.dust.attachment.slack.thread": [".txt"],
};

// Supported content types for plain text (after processing).
const supportedPlainText = {
  // We support all tabular content types as plain text.
  ...supportedDelimitedText,
  ...supportedRawText,

  "application/msword": [".doc", ".docx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".doc",
    ".docx",
  ],
  "application/pdf": [".pdf"],
} as const;

// Supported content types for images.
const supportedImage = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
} as const;

const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr));

export const supportedPlainTextExtensions = uniq(
  Object.values(supportedPlainText).flat()
);

export const supportedDelimitedTextExtensions = uniq(
  Object.values(supportedDelimitedText).flat()
);

export const supportedImageExtensions = uniq(
  Object.values(supportedImage).flat()
);

export const supportedFileExtensions = uniq([
  ...supportedPlainTextExtensions,
  ...supportedImageExtensions,
]);

export const supportedPlainTextContentTypes = Object.keys(
  supportedPlainText
) as (keyof typeof supportedPlainText)[];
export const supportedImageContentTypes = Object.keys(
  supportedImage
) as (keyof typeof supportedImage)[];
export const supportedDelimitedTextContentTypes = Object.keys(
  supportedDelimitedText
) as (keyof typeof supportedDelimitedText)[];
export const supportedRawTextContentTypes = Object.keys(
  supportedRawText
) as (keyof typeof supportedRawText)[];

export const supportedUploadableContentType = [
  ...supportedPlainTextContentTypes,
  ...supportedImageContentTypes,
];
export const supportedInlinedContentType = [
  ...supportedDelimitedTextContentTypes,
  ...supportedRawTextContentTypes,
];

// Infer types from the arrays.
export type PlainTextContentType = keyof typeof supportedPlainText;
export type ImageContentType = keyof typeof supportedImage;
export type DelimitedTextContentType = keyof typeof supportedDelimitedText;
export type RawTextContentType = keyof typeof supportedRawText;

// Union type for all supported content types.
export type SupportedFileContentType = PlainTextContentType | ImageContentType;

export function isSupportedFileContentType(
  contentType: string
): contentType is SupportedFileContentType {
  return supportedUploadableContentType.includes(
    contentType as SupportedFileContentType
  );
}

export type SupportedInlinedContentType =
  | DelimitedTextContentType
  | RawTextContentType;

export function isSupportedInlinedContentType(
  contentType: string
): contentType is SupportedInlinedContentType {
  return supportedInlinedContentType.includes(
    contentType as SupportedInlinedContentType
  );
}

export function isSupportedPlainTextContentType(
  contentType: string
): contentType is PlainTextContentType {
  return supportedPlainTextContentTypes.includes(
    contentType as PlainTextContentType
  );
}

export function isSupportedImageContentType(
  contentType: string
): contentType is ImageContentType {
  return supportedImageContentTypes.includes(contentType as ImageContentType);
}

export function isSupportedDelimitedTextContentType(
  contentType: string
): contentType is DelimitedTextContentType {
  return supportedDelimitedTextContentTypes.includes(
    contentType as DelimitedTextContentType
  );
}

// Types.

export type FileStatus = "created" | "failed" | "ready";

export type FileUseCase =
  | "conversation"
  | "avatar"
  | "tool_output"
  | "folder_document"
  | "folder_table";

export type FileUseCaseMetadata = {
  conversationId: string;
};

export interface FileType {
  contentType: SupportedFileContentType;
  downloadUrl?: string;
  fileName: string;
  fileSize: number;
  id: string;
  status: FileStatus;
  uploadUrl?: string;
  publicUrl?: string;
  useCase: FileUseCase;
}

export type FileTypeWithUploadUrl = FileType & { uploadUrl: string };

export function ensureContentTypeForUseCase(
  contentType: SupportedFileContentType,
  useCase: FileUseCase
) {
  if (useCase === "conversation") {
    return isSupportedFileContentType(contentType);
  }

  if (useCase === "avatar") {
    return isSupportedImageContentType(contentType);
  }

  if (useCase === "folder_document") {
    // Only allow users to upload text documents in folders.
    return isSupportedPlainTextContentType(contentType);
  }

  if (useCase === "folder_table") {
    return isSupportedDelimitedTextContentType(contentType);
  }

  return false;
}
