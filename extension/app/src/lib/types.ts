import type { UploadedContentFragmentType } from "@dust-tt/client";

export type UploadedFileKind = "attachment" | "tab_content";

export type UploadedFileWithKind = UploadedContentFragmentType & {
  kind: UploadedFileKind;
};
