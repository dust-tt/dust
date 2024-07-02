import * as t from "io-ts";

import {
  isSupportedImageContentFragmentType,
  isSupportedTextContentFragmentType,
} from "./content_fragment";

// File upload form validation.

export const FileUploadUrlRequestSchema = t.type({
  contentType: t.string,
  fileName: t.string,
  fileSize: t.number,
});

export type FileUploadUrlRequestType = t.TypeOf<
  typeof FileUploadUrlRequestSchema
>;

export interface FileUploadRequestResponseBody {
  fileId: string;
  uploadUrl: string;
}

export const MAX_TEXT_FILE_SIZE = 30 * 1024 * 1024; // 30MB in bytes.

export const MAX_IMAGE_FILE_SIZE = 3 * 1024 * 1024; // 3MB in bytes.

// TODO: (2024-06-28 flav) Rename all occurrences of content fragment from the file logic.
export function getMaximumFileSizeForContentType(
  fileContentType: string
): number {
  if (isSupportedImageContentFragmentType(fileContentType)) {
    return MAX_IMAGE_FILE_SIZE;
  } else if (isSupportedTextContentFragmentType(fileContentType)) {
    return MAX_TEXT_FILE_SIZE;
  }

  return 0;
}
