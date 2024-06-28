import * as t from "io-ts";

// File upload form validation.

export const FileUploadUrlRequestSchema = t.type({
  fileName: t.string,
  fileSize: t.number,
  // TODO(2024-06-28 flav) Refine based on accepted content types.
  contentType: t.string,
});

export type FileUploadUrlRequestType = t.TypeOf<
  typeof FileUploadUrlRequestSchema
>;

export interface FileUploadRequestResponseBody {
  fileId: string;
  uploadUrl: string;
}
