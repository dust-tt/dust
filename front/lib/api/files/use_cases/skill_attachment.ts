import type { FileEntry } from "@app/lib/api/skills/detection/types";
import type { AllSupportedFileContentType } from "@app/types/files";
import { FILE_FORMATS } from "@app/types/files";
import path from "path";

const SKILL_ATTACHMENT_CONTENT_TYPES = [
  // Images (used as-is, no resize for skill attachments).
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",

  // Documents (text extracted during processing).
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",

  // Spreadsheets (Excel: text extracted; CSV/TSV: used as-is).
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/tab-separated-values",

  // Plain text and code (used as-is).
  "application/octet-stream",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "text/calendar",
  "text/css",
  "text/javascript",
  "text/typescript",
  "application/json",
  "application/xml",
  "application/x-sh",
  "text/x-sh",
  "text/x-python",
  "text/x-python-script",
  "application/x-yaml",
  "text/yaml",
  "text/vnd.yaml",
  "text/x-c",
  "text/x-csharp",
  "text/x-java-source",
  "text/x-php",
  "text/x-ruby",
  "text/x-sql",
  "text/x-swift",
  "text/x-rust",
  "text/x-go",
  "text/x-kotlin",
  "text/x-scala",
  "text/x-groovy",
  "text/x-perl",
  "text/x-perl-script",
  "message/rfc822",
] as const satisfies readonly AllSupportedFileContentType[];

export type SkillAttachmentContentType =
  (typeof SKILL_ATTACHMENT_CONTENT_TYPES)[number];

export function isSupportedForSkillAttachment(
  contentType: AllSupportedFileContentType
): contentType is SkillAttachmentContentType {
  return SKILL_ATTACHMENT_CONTENT_TYPES.some((ct) => ct === contentType);
}

export function getSkillAttachmentContentType(
  entry: FileEntry
): SkillAttachmentContentType | null {
  const ext = path.extname(entry.path).toLowerCase();
  if (!ext) {
    return null;
  }
  for (const contentType of SKILL_ATTACHMENT_CONTENT_TYPES) {
    if (FILE_FORMATS[contentType].exts.some((e) => ext === e)) {
      return contentType;
    }
  }
  return null;
}
