import type { DustMimeType } from "@dust-tt/client";

import type { MessageType, MessageVisibility } from "./assistant/conversation";
import type { ContentNodeType } from "./core/content_node";
import type { DataSourceViewContentNode } from "./data_source_view";
import type { SupportedFileContentType } from "./files";
import type { ModelId } from "./shared/model_id";

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

export type ContentFragmentNodeData = {
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
  provider: string;
  spaceName: string;
};

export type ContentFragmentType = {
  id: ModelId;
  sId: string;
  fileId: string | null;
  nodeId: string | null;
  nodeDataSourceViewId: string | null;
  nodeType: ContentNodeType | null;
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
  contentNodeData: ContentFragmentNodeData | null;
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

export function isFileAttachment(
  arg: ContentFragmentType
): arg is ContentFragmentType & { fileId: string } {
  return !!arg.fileId;
}

export function isContentNodeAttachment(
  arg: ContentFragmentType
): arg is ContentFragmentType & {
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
} {
  return !!arg.nodeId && !!arg.nodeDataSourceViewId;
}
