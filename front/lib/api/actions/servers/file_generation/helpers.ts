import type { OutputFormatType } from "@app/lib/api/actions/servers/file_generation/metadata";
import {
  BINARY_FORMATS,
  OUTPUT_FORMATS,
} from "@app/lib/api/actions/servers/file_generation/metadata";
import type { SupportedFileContentType } from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function isValidOutputType(
  extension: string
): extension is OutputFormatType {
  return OUTPUT_FORMATS.includes(extension as OutputFormatType);
}

export function isBinaryFormat(
  extension: string
): extension is OutputFormatType {
  return BINARY_FORMATS.includes(extension as OutputFormatType);
}

export function getContentTypeFromOutputFormat(
  outputFormat: OutputFormatType
): SupportedFileContentType {
  switch (outputFormat) {
    case "md":
      return "text/markdown";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "csv":
      return "text/csv";
    case "txt":
      return "text/plain";
    case "html":
      return "text/html";
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "xml":
      return "text/xml";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "webp":
      return "image/webp";
    default:
      assertNever(outputFormat);
  }
}
