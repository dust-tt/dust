// Types.
import { removeNulls } from "../shared/utils/general";

const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr));

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

export type FileFormatCategory = "image" | "data" | "code" | "delimited";

// Define max sizes for each category.
export const MAX_FILE_SIZES: Record<FileFormatCategory, number> = {
  data: 30 * 1024 * 1024, // 30MB.
  code: 30 * 1024 * 1024, // 30MB.
  delimited: 30 * 1024 * 1024, // 30MB.
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
  const format = getFileFormat(contentType);

  if (format) {
    return fileSize <= MAX_FILE_SIZES[format.cat];
  }

  return false;
}

type FileFormat = {
  cat: FileFormatCategory;
  exts: string[];
};

// NOTE: if we add more content types, we need to update the public api package. (but the typechecker should catch it)
const FILE_FORMATS = {
  // Images
  "image/jpeg": { cat: "image", exts: [".jpg", ".jpeg"] },
  "image/png": { cat: "image", exts: [".png"] },
  "image/gif": { cat: "image", exts: [".gif"] },
  "image/webp": { cat: "image", exts: [".webp"] },

  // Structured
  "text/csv": { cat: "delimited", exts: [".csv"] },
  "text/comma-separated-values": { cat: "delimited", exts: [".csv"] },
  "text/tsv": { cat: "delimited", exts: [".tsv"] },
  "text/tab-separated-values": { cat: "delimited", exts: [".tsv"] },

  // Data
  "text/plain": { cat: "data", exts: [".txt"] },
  "text/markdown": { cat: "data", exts: [".md", ".markdown"] },
  "text/vnd.dust.attachment.slack.thread": { cat: "data", exts: [".txt"] },
  "text/calendar": { cat: "data", exts: [".ics"] },
  "application/json": { cat: "data", exts: [".json"] },
  "application/msword": { cat: "data", exts: [".doc", ".docx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    cat: "data",
    exts: [".doc", ".docx"],
  },
  "application/pdf": { cat: "data", exts: [".pdf"] },

  // Code
  "text/xml": { cat: "data", exts: [".xml"] },
  "application/xml": { cat: "data", exts: [".xml"] },
  "text/html": { cat: "data", exts: [".html", ".htm", ".xhtml", ".xhtml+xml"] },
  "text/css": { cat: "code", exts: [".css"] },
  "text/javascript": { cat: "code", exts: [".js", ".mjs"] },
  "application/x-sh": { cat: "code", exts: [".sh"] },
  // declare type here using satisfies to allow flexible typing for keys, FileFormat type for values and yet infer the keys of FILE_FORMATS correctly below
} as const satisfies Record<string, FileFormat>;

// Define a type that is the list of all keys from FILE_FORMATS.
export type SupportedFileContentType = keyof typeof FILE_FORMATS;

export type SupportedImageContentType = {
  [K in keyof typeof FILE_FORMATS]: (typeof FILE_FORMATS)[K] extends {
    cat: "image";
  }
    ? K
    : never;
}[keyof typeof FILE_FORMATS];

export type SupportedDelimitedTextContentType = {
  [K in keyof typeof FILE_FORMATS]: (typeof FILE_FORMATS)[K] extends {
    cat: "delimited";
  }
    ? K
    : never;
}[keyof typeof FILE_FORMATS];

export type SupportedNonImageContentType = {
  [K in keyof typeof FILE_FORMATS]: (typeof FILE_FORMATS)[K] extends {
    cat: "image";
  }
    ? never
    : K;
}[keyof typeof FILE_FORMATS];

// All the ones listed above
export const supportedUploadableContentType = Object.keys(FILE_FORMATS);

export function isSupportedFileContentType(
  contentType: string
): contentType is SupportedFileContentType {
  return !!FILE_FORMATS[contentType as SupportedFileContentType];
}

export function isSupportedImageContentType(
  contentType: string
): contentType is SupportedImageContentType {
  const format = getFileFormat(contentType);

  if (format) {
    return format.cat === "image";
  }

  return false;
}

export function isSupportedDelimitedTextContentType(
  contentType: string
): contentType is SupportedDelimitedTextContentType {
  const format = getFileFormat(contentType);

  if (format) {
    return format.cat === "delimited";
  }

  return false;
}

export function getFileFormatCategory(
  contentType: string
): FileFormatCategory | null {
  const format = getFileFormat(contentType);

  if (format) {
    return format.cat;
  }

  return null;
}

function getFileFormat(contentType: string): FileFormat | null {
  if (isSupportedFileContentType(contentType)) {
    const format = FILE_FORMATS[contentType];

    if (format) {
      return format;
    }
  }

  return null;
}

export function extensionsForContentType(
  contentType: SupportedFileContentType
): string[] {
  const format = getFileFormat(contentType);

  if (format) {
    return format.exts;
  }

  return [];
}

export function getSupportedFileExtensions(
  cat: FileFormatCategory | undefined = undefined
) {
  return uniq(
    removeNulls(
      Object.values(FILE_FORMATS).flatMap((format) =>
        !cat || format.cat === cat ? format.exts : []
      )
    )
  );
}

export function getSupportedNonImageFileExtensions() {
  return uniq(
    removeNulls(
      Object.values(FILE_FORMATS).flatMap((format) =>
        format.cat !== "image" ? format.exts : []
      )
    )
  );
}

export function getSupportedNonImageMimeTypes() {
  return uniq(
    removeNulls(
      Object.entries(FILE_FORMATS).map(([key, value]) =>
        value.cat !== "image" ? (key as SupportedNonImageContentType) : null
      )
    )
  );
}
