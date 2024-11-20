import type { UploadedContentFragmentType } from "@dust-tt/client";

export type UploadedFileKind = "attachment" | "tab_content" | "selection";

export type UploadedFileWithKind = UploadedContentFragmentType & {
  kind: UploadedFileKind;
};

export type UploadedFileWithSupersededContentFragmentId =
  UploadedContentFragmentType & {
    supersededContentFragmentId?: string;
  };
