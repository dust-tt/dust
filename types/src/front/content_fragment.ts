import { DustMimeType } from "../shared/internal_mime_types";
import { ModelId } from "../shared/model_id";
import { MessageType, MessageVisibility } from "./assistant/conversation";
import { DataSourceViewContentNode } from "./data_source_view";
import { SupportedFileContentType } from "./files";

export type ContentFragmentContextType = {
  username: string | null;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

export type ContentFragmentVersion = "superseded" | "latest";

export type SupportedContentFragmentType =
  | SupportedFileContentType
  | DustMimeType
  | "dust-application/slack"; // Legacy

export type ContentFragmentType = {
  id: ModelId;
  sId: string;
  fileId: string | null;
  nodeId: string | null;
  nodeDataSourceViewId: string | null;
  snippet: string | null;
  generatedTables: string[];
  created: number;
  type: "content_fragment";
  visibility: MessageVisibility;
  version: number;
  sourceUrl: string | null;
  textUrl: string;
  textBytes: number | null;
  title: string;
  contentType: SupportedContentFragmentType;
  context: ContentFragmentContextType;
  contentFragmentId: string;
  contentFragmentVersion: ContentFragmentVersion;
};

export type UploadedContentFragment = {
  fileId: string;
  title: string;
};

export type ContentFragmentsType = {
  uploaded: UploadedContentFragment[];
  contentNodes: DataSourceViewContentNode[];
};

export function isContentFragmentType(
  arg: MessageType
): arg is ContentFragmentType {
  return arg.type === "content_fragment";
}
