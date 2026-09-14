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

/**
 * Conversation-wide inputs deciding which JIT capabilities a file attachment can expose. Resolved
 * once per conversation (see `getAttachmentCapabilityContext`) and passed down so the capability
 * flags on an attachment can be trusted without re-checking the conversation or the workspace.
 */
export type AttachmentCapabilityContext = {
  /** The conversation exposes its files through the `files` MCP server rather than by fileId. */
  isNewFileExplorer: boolean;
  /** The workspace can run the Computer, which handles tabular files itself. */
  hasSandboxTools: boolean;
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
  processedPath?: string | null;
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

export type GetConversationAttachmentsResponseBody = {
  attachments: ConversationAttachmentType[];
};
