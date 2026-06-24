import type {
  ContentFragmentVersion,
  SupportedContentFragmentType,
} from "@app/types/content_fragment";
import type { ContentNodeType } from "@app/types/core/content_node";

export type AttachmentCreator = {
  type: "agent" | "user";
  name: string;
  pictureUrl: string;
};

export type BaseConversationAttachmentType = {
  title: string;
  contentType: SupportedContentFragmentType;
  contentFragmentVersion: ContentFragmentVersion;
  snippet: string | null;
  generatedTables: string[];
  isIncludable: boolean;
  isSearchable: boolean;
  isQueryable: boolean;
  isInProjectContext: boolean;
  creator: AttachmentCreator | null;
  hidden: boolean; // Do not show this attachment to the user.
};

export type FileAttachmentType = BaseConversationAttachmentType & {
  fileId: string;
  path: string | null;
  source: "agent" | "user" | null;
  createdAt?: number;
  updatedAt?: number;
};

export type ContentNodeAttachmentType = BaseConversationAttachmentType & {
  contentFragmentId: string;
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
  sourceUrl: string | null;
  lastUpdatedAt?: number | null; //Last sync / update timestamp for the underlying data source node (Core node timestamp).
};

export type LargePasteType = {
  title: string;
};

export type ConversationAttachmentType =
  | FileAttachmentType
  | ContentNodeAttachmentType;

/** Same item shape as GET `/assistant/conversations/[cId]/attachments` and GET project context. */
export type ContextAttachmentItem = ConversationAttachmentType;

export type GetConversationAttachmentsResponseBody = {
  attachments: ConversationAttachmentType[];
};
