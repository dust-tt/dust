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

const BIG_FILE_SIZE = 5_000_000;

export function isBigFileSize(size: number) {
  return size > BIG_FILE_SIZE;
}

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

const supportedImageExtensions = uniq(Object.values(supportedImage).flat());

export const supportedFileExtensions = uniq([
  ...supportedPlainTextExtensions,
  ...supportedImageExtensions,
]);

const supportedPlainTextContentTypes = Object.keys(
  supportedPlainText
) as (keyof typeof supportedPlainText)[];
const supportedImageContentTypes = Object.keys(
  supportedImage
) as (keyof typeof supportedImage)[];
const supportedDelimitedTextContentTypes = Object.keys(
  supportedDelimitedText
) as (keyof typeof supportedDelimitedText)[];
const supportedRawTextContentTypes = Object.keys(
  supportedRawText
) as (keyof typeof supportedRawText)[];

// All the ones listed above
export const supportedUploadableContentType = [
  ...supportedPlainTextContentTypes,
  ...supportedImageContentTypes,
];
export const supportedInlinedContentType = [
  ...supportedDelimitedTextContentTypes,
  ...supportedRawTextContentTypes,
];

// Infer types from the arrays.
type PlainTextContentType = keyof typeof supportedPlainText;
type ImageContentType = keyof typeof supportedImage;
type DelimitedTextContentType = keyof typeof supportedDelimitedText;

// Union type for all supported content types.
export type SupportedFileContentType = PlainTextContentType | ImageContentType;

export function isSupportedFileContentType(
  contentType: string
): contentType is SupportedFileContentType {
  return supportedUploadableContentType.includes(
    contentType as SupportedFileContentType
  );
}

function isSupportedPlainTextContentType(
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

export function extensionsForContentType(
  contentType: SupportedFileContentType
): string[] {
  if (isSupportedPlainTextContentType(contentType)) {
    return [...supportedPlainText[contentType]];
  }

  if (isSupportedImageContentType(contentType)) {
    return [...supportedImage[contentType]];
  }

  return [];
}
