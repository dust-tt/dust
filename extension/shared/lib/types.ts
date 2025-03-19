import type {
  DataSourceViewContentNodeType,
  UploadedContentFragmentType,
} from "@dust-tt/client";

export type UploadedFileKind = "attachment" | "tab_content" | "selection";

export type UploadedContentFragmentTypeWithKind =
  UploadedContentFragmentType & {
    kind: UploadedFileKind;
  };

export type UploadedFileWithSupersededContentFragmentId =
  UploadedContentFragmentType & {
    supersededContentFragmentId?: string;
  };

export type ContentFragmentsType = {
  uploaded: UploadedContentFragmentTypeWithKind[];
  contentNodes: DataSourceViewContentNodeType[];
};
