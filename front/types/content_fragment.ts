/* eslint-disable dust/enforce-client-types-in-public-api */
import type { DustMimeType } from "@dust-tt/client";

import type { ConnectorProvider } from "@app/types/data_source";

import type {
  LightMessageType,
  MessageType,
  MessageVisibility,
} from "./assistant/conversation";
import type { ContentNodeType } from "./core/content_node";
import type { DataSourceViewContentNode } from "./data_source_view";
import type { SupportedFileContentType } from "./files";
import type { ModelId } from "./shared/model_id";

export type ContentFragmentExpiredReason = "data_source_deleted";

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
  provider: ConnectorProvider | null;
  spaceName: string;
};

export type BaseContentFragmentType = {
  type: "content_fragment";
  id: ModelId;
  sId: string;
  created: number;
  visibility: MessageVisibility;
  version: number;
  rank: number;
  sourceUrl: string | null;
  title: string;
  contentType: SupportedContentFragmentType;
  context: ContentFragmentContextType;
  contentFragmentId: string;
  contentFragmentVersion: ContentFragmentVersion;
  expiredReason: ContentFragmentExpiredReason | null;
};

export type ContentNodeContentFragmentType = BaseContentFragmentType & {
  contentFragmentType: "content_node";
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
  contentNodeData: ContentFragmentNodeData;
};

export type FileContentFragmentType = BaseContentFragmentType & {
  contentFragmentType: "file";
  fileId: string | null;
  snippet: string | null;
  generatedTables: string[];
  textUrl: string;
  textBytes: number | null;
};

export type ContentFragmentType =
  | FileContentFragmentType
  | ContentNodeContentFragmentType;

export type UploadedContentFragment = {
  fileId: string;
  title: string;
};

export type ContentFragmentsType = {
  uploaded: UploadedContentFragment[];
  contentNodes: DataSourceViewContentNode[];
};

export function isContentFragmentType(
  arg: MessageType | LightMessageType
): arg is ContentFragmentType {
  return arg.type === "content_fragment";
}

export function isFileContentFragment(
  arg: ContentFragmentType
): arg is FileContentFragmentType {
  return arg.contentFragmentType === "file";
}

export function isContentNodeContentFragment(
  arg: ContentFragmentType
): arg is ContentNodeContentFragmentType {
  return arg.contentFragmentType === "content_node";
}
