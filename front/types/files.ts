// Types.
import { removeNulls } from "./shared/utils/general";

const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr));

export const TABLE_PREFIX = "TABLE:";

export type FileStatus = "created" | "failed" | "ready";

export type FileUseCase =
  | "conversation"
  | "avatar"
  | "tool_output"
  // Upsert document: case in which a document first exists as a file resource
  // on our end, and we wish to upsert it in a datasource. In that case, it will
  // be temporarily stored in the upsert queue during the upsert operation (and
  // exists permanently as a file resource).
  | "upsert_document"
  // Folders document: case in which a document is uploaded from scratch (e.g.
  // via the UI in a Folder). In that case, it will be stored permanently as a file
  // resource even for the upsert (no need to transit via upsert queue).
  | "folders_document"
  | "upsert_table";

export type FileUseCaseMetadata = {
  conversationId?: string;
  spaceId?: string;
  generatedTables?: string[];
};

export interface FileType {
  contentType: SupportedFileContentType;
  downloadUrl?: string;
  fileName: string;
  fileSize: number;
  sId: string;
  // TODO(spolu): move this to being the ModelId
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
  data: 50 * 1024 * 1024, // 50MB.
  code: 50 * 1024 * 1024, // 50MB.
  delimited: 50 * 1024 * 1024, // 50MB.
  image: 5 * 1024 * 1024, // 5 MB
};

export function maxFileSizeToHumanReadable(size: number, decimals = 0) {
  if (size < 1024) {
    return `${size.toFixed(decimals)} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(decimals)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(decimals)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(decimals)} GB`;
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
  /**
   * Indicates whether the file type can be safely displayed directly in the browser.
   *
   * Security considerations:
   * - Default is false (not safe to display)
   * - Only explicitly whitelisted file types should be marked as safe
   * - File types that could contain executable code or XSS vectors should never be marked as safe
   * - Unknown content types are treated as unsafe by default
   *
   * Safe file types typically include:
   * - Images (jpeg, png, gif, webp)
   * - Documents (pdf, doc, ppt)
   * - Plain text formats (txt, markdown)
   * - Structured data (json, csv)
   *
   * Unsafe file types include:
   * - HTML and XML files
   * - Script files (js, ts, py, etc.)
   * - Any file type that could contain executable code
   */
  isSafeToDisplay: boolean;
};

// NOTE: if we add more content types, we need to update the public api package. (but the typechecker should catch it)
export const FILE_FORMATS = {
  // Images
  "image/jpeg": {
    cat: "image",
    exts: [".jpg", ".jpeg"],
    isSafeToDisplay: true,
  },
  "image/png": { cat: "image", exts: [".png"], isSafeToDisplay: true },
  "image/gif": { cat: "image", exts: [".gif"], isSafeToDisplay: true },
  "image/webp": { cat: "image", exts: [".webp"], isSafeToDisplay: true },

  // Structured
  "text/csv": { cat: "delimited", exts: [".csv"], isSafeToDisplay: true },
  "text/comma-separated-values": {
    cat: "delimited",
    exts: [".csv"],
    isSafeToDisplay: true,
  },
  "text/tsv": { cat: "delimited", exts: [".tsv"], isSafeToDisplay: true },
  "text/tab-separated-values": {
    cat: "delimited",
    exts: [".tsv"],
    isSafeToDisplay: true,
  },
  "application/vnd.ms-excel": {
    cat: "delimited",
    exts: [".xls"],
    isSafeToDisplay: true,
  },
  "application/vnd.google-apps.spreadsheet": {
    cat: "delimited",
    exts: [],
    isSafeToDisplay: true,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    cat: "delimited",
    exts: [".xlsx"],
    isSafeToDisplay: true,
  },

  // Custom for section json files generated from tables query results.
  "application/vnd.dust.section.json": {
    cat: "data",
    exts: [".json"],
    isSafeToDisplay: true,
  },

  // Data
  "text/plain": {
    cat: "data",
    exts: [".txt", ".log", ".cfg", ".conf"],
    isSafeToDisplay: true,
  },
  "text/markdown": {
    cat: "data",
    exts: [".md", ".markdown"],
    isSafeToDisplay: true,
  },
  "text/vnd.dust.attachment.slack.thread": {
    cat: "data",
    exts: [".txt"],
    isSafeToDisplay: true,
  },
  "text/calendar": { cat: "data", exts: [".ics"], isSafeToDisplay: true },
  "application/json": { cat: "data", exts: [".json"], isSafeToDisplay: true },
  "application/msword": {
    cat: "data",
    exts: [".doc", ".docx"],
    isSafeToDisplay: true,
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    cat: "data",
    exts: [".doc", ".docx"],
    isSafeToDisplay: true,
  },
  "application/vnd.ms-powerpoint": {
    cat: "data",
    exts: [".ppt", ".pptx"],
    isSafeToDisplay: true,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    cat: "data",
    exts: [".ppt", ".pptx"],
    isSafeToDisplay: true,
  },
  "application/pdf": { cat: "data", exts: [".pdf"], isSafeToDisplay: true },
  "application/vnd.google-apps.document": {
    cat: "data",
    exts: [],
    isSafeToDisplay: true,
  },
  "application/vnd.google-apps.presentation": {
    cat: "data",
    exts: [],
    isSafeToDisplay: true,
  },

  // Code - most code files are not safe to display by default
  "text/xml": { cat: "data", exts: [".xml"], isSafeToDisplay: false },
  "application/xml": { cat: "data", exts: [".xml"], isSafeToDisplay: false },
  "text/html": {
    cat: "data",
    exts: [".html", ".htm", ".xhtml", ".xhtml+xml"],
    isSafeToDisplay: false,
  },
  "text/css": { cat: "code", exts: [".css"], isSafeToDisplay: false },
  "text/javascript": {
    cat: "code",
    exts: [".js", ".mjs", "*.jsx"],
    isSafeToDisplay: false,
  },
  "text/typescript": {
    cat: "code",
    exts: [".ts", ".tsx"],
    isSafeToDisplay: false,
  },
  "application/x-sh": { cat: "code", exts: [".sh"], isSafeToDisplay: false },
  "text/x-sh": { cat: "code", exts: [".sh"], isSafeToDisplay: false },
  "text/x-python": { cat: "code", exts: [".py"], isSafeToDisplay: false },
  "text/x-python-script": {
    cat: "code",
    exts: [".py"],
    isSafeToDisplay: false,
  },
  "application/x-yaml": {
    cat: "code",
    exts: [".yaml", ".yml"],
    isSafeToDisplay: false,
  },
  "text/yaml": { cat: "code", exts: [".yaml", ".yml"], isSafeToDisplay: false },
  "text/vnd.yaml": {
    cat: "code",
    exts: [".yaml", ".yml"],
    isSafeToDisplay: false,
  },
  "text/x-c": {
    cat: "code",
    exts: [".c", ".cc", ".cpp", ".cxx", ".dic", ".h", ".hh"],
    isSafeToDisplay: false,
  },
  "text/x-csharp": { cat: "code", exts: [".cs"], isSafeToDisplay: false },
  "text/x-java-source": {
    cat: "code",
    exts: [".java"],
    isSafeToDisplay: false,
  },
  "text/x-php": { cat: "code", exts: [".php"], isSafeToDisplay: false },
  "text/x-ruby": { cat: "code", exts: [".rb"], isSafeToDisplay: false },
  "text/x-sql": { cat: "code", exts: [".sql"], isSafeToDisplay: false },
  "text/x-swift": { cat: "code", exts: [".swift"], isSafeToDisplay: false },
  "text/x-rust": { cat: "code", exts: [".rs"], isSafeToDisplay: false },
  "text/x-go": { cat: "code", exts: [".go"], isSafeToDisplay: false },
  "text/x-kotlin": {
    cat: "code",
    exts: [".kt", ".kts"],
    isSafeToDisplay: false,
  },
  "text/x-scala": { cat: "code", exts: [".scala"], isSafeToDisplay: false },
  "text/x-groovy": { cat: "code", exts: [".groovy"], isSafeToDisplay: false },
  "text/x-perl": { cat: "code", exts: [".pl", ".pm"], isSafeToDisplay: false },
  "text/x-perl-script": {
    cat: "code",
    exts: [".pl", ".pm"],
    isSafeToDisplay: false,
  },
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

// UseCases supported on the public API
export function isPublicySupportedUseCase(
  useCase: string
): useCase is FileUseCase {
  return ["conversation"].includes(useCase);
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

export function contentTypeForExtension(
  extension: string
): SupportedFileContentType | null {
  // Type assertion to handle the entries
  const entries = Object.entries(FILE_FORMATS) as [
    SupportedFileContentType,
    FileFormat,
  ][];

  return (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    entries.find(([_, value]) => value.exts.includes(extension))?.[0] || null
  );
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
