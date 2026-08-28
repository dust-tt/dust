// All mime types are okay to use from the public API.

import { DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME } from "@app/lib/actions/constants";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CONVERSATION_CAT_FILE_ACTION_NAME,
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME,
} from "@app/lib/api/actions/servers/conversation_files/metadata";
import {
  isConversationIncludableFileContentType,
  isQueryableContentType,
  isSearchableContentType,
} from "@app/lib/api/assistant/conversation/content_types";
import { isPastedFile } from "@app/lib/files";
import logger from "@app/logger/logger";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/assistant";
import type {
  AttachmentCapabilityContext,
  AttachmentCreator,
  BaseConversationAttachmentType,
  ContentNodeAttachmentType,
  ConversationAttachmentType,
  FileAttachmentType,
  LargePasteType,
} from "@app/types/api/assistant/conversation/attachments";
import type {
  ContentFragmentType,
  ContentNodeContentFragmentType,
  FileContentFragmentType,
  SupportedContentFragmentType,
} from "@app/types/content_fragment";
import {
  isContentNodeContentFragment,
  isExpiredContentFragment,
  isFileContentFragment,
} from "@app/types/content_fragment";
import { DATA_SOURCE_NODE_ID } from "@app/types/core/content_node";
import type { AllSupportedFileContentType } from "@app/types/files";
import { isSupportedDelimitedTextContentType } from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { CONTENT_NODE_MIME_TYPES } from "@dust-tt/client";

export function isFileAttachmentType(
  attachment: ConversationAttachmentType
): attachment is FileAttachmentType {
  return "fileId" in attachment;
}

export function isContentNodeAttachmentType(
  attachment: ConversationAttachmentType
): attachment is ContentNodeAttachmentType {
  return "contentFragmentId" in attachment;
}

export function isContentFragmentDataSourceNode(
  attachment: ContentNodeAttachmentType | ContentFragmentInputWithContentNode
): attachment is ContentNodeAttachmentType & {
  nodeId: typeof DATA_SOURCE_NODE_ID;
} {
  return attachment.nodeId === DATA_SOURCE_NODE_ID;
}

// If updating this function, make sure to update `contentFragmentId` when we render the conversation
// for the model. So there is a consistent way to reference content fragments across different actions.
export function conversationAttachmentId(
  attachment: ConversationAttachmentType
): string {
  if (isFileAttachmentType(attachment)) {
    return attachment.fileId;
  }
  return attachment.contentFragmentId;
}

export function getAttachmentFromContentFragment({
  cf,
  capabilities,
}: {
  cf: ContentFragmentType;
  capabilities: AttachmentCapabilityContext;
}): ConversationAttachmentType | null {
  // Expired content fragments cannot be converted to attachments
  if (isExpiredContentFragment(cf)) {
    return null;
  }

  if (isContentNodeContentFragment(cf)) {
    // Content nodes are not files: they live outside the file mount and are reached through the
    // conversation tools in every mode, so their capabilities do not depend on the context.
    return getAttachmentFromContentNodeContentFragment({ cf });
  }
  if (isFileContentFragment(cf)) {
    return getAttachmentFromFileContentFragment({ cf, capabilities });
  }
  assertNever(cf);
}

export function getAttachmentFromContentNodeContentFragment({
  cf,
}: {
  cf: ContentNodeContentFragmentType & { expiredReason: null };
}): ContentNodeAttachmentType {
  const isQueryable =
    isQueryableContentType(cf.contentType) || cf.nodeType === "table";
  const isIncludable =
    cf.nodeType !== "folder" &&
    isConversationIncludableFileContentType(cf.contentType) &&
    // Tables from knowledge are not materialized as raw content. As such, they cannot be
    // included.
    !isQueryable;
  // Tables from knowledge are not materialized as raw content. As such, they cannot be
  // searched--except for notion databases, that may have children.
  const isUnmaterializedTable =
    isQueryable && cf.contentType !== CONTENT_NODE_MIME_TYPES.NOTION.DATABASE;
  const isSearchable =
    isSearchableContentType(cf.contentType) && !isUnmaterializedTable;

  const creator: AttachmentCreator | null = cf.context.fullName
    ? {
        type: "user",
        name: cf.context.fullName,
        pictureUrl: cf.context.profilePictureUrl ?? "",
      }
    : null;

  const baseAttachment: BaseConversationAttachmentType = {
    title: cf.title,
    contentType: cf.contentType,
    snippet: null,
    contentFragmentVersion: cf.contentFragmentVersion,
    // Backward compatibility: we fallback to the fileId if no generated tables are mentioned
    // but the file is queryable.
    generatedTables: isQueryable ? [cf.nodeId] : [],
    isIncludable,
    isQueryable,
    isSearchable,
    isInProjectContext: false, // For now, content nodes can only be from the conversation, not the project. To be revisited if/when we allow connected data in the projects.
    hidden: false, // For now, content nodes are not hidden from the user.
    creator,
  };

  return {
    ...baseAttachment,
    nodeDataSourceViewId: cf.nodeDataSourceViewId,
    contentFragmentId: cf.contentFragmentId,
    nodeId: cf.nodeId,
    nodeType: cf.nodeType,
    sourceUrl: cf.sourceUrl,
  };
}

/**
 * `skipFileProcessing` files were uploaded raw for the Computer, so they have no table to query and
 * no processed text to read. The project-context exemption only bites in legacy conversations: Pods
 * always use the file explorer, which turns every flag off before we get here.
 */
function shouldSuppressTabularAttachmentHints({
  contentType,
  isInProjectContext,
  skipFileProcessing,
}: {
  contentType: SupportedContentFragmentType;
  isInProjectContext: boolean | null;
  skipFileProcessing: boolean;
}): boolean {
  return (
    isInProjectContext !== true &&
    skipFileProcessing &&
    isSupportedDelimitedTextContentType(contentType)
  );
}

/**
 * Capability flags for file attachments. Gated early so callers (JIT, Use: lines, tools) can
 * trust the booleans without re-checking file-explorer / Computer availability.
 *
 * In file explorer mode every flag is off: files are reached by path through the `files` MCP server
 * and tabular files are analyzed by the Computer, so none of the conversation_files JIT tools apply.
 */
function computeFileAttachmentCapabilityFlags({
  contentType,
  snippet,
  isInProjectContext,
  skipFileProcessing,
  capabilities: { isNewFileExplorer, hasSandboxTools },
}: {
  contentType: SupportedContentFragmentType;
  snippet: string | null;
  isInProjectContext: boolean;
  skipFileProcessing: boolean;
  capabilities: AttachmentCapabilityContext;
}): {
  isQueryable: boolean;
  isIncludable: boolean;
  isSearchable: boolean;
} {
  // snippet !== null distinguishes pre-JIT attachments (no snippet) from newer ones.
  // Pasted files and the new file explorer do not use conversation_files JIT for regular files.
  const canDoJIT =
    snippet !== null && !isPastedFile(contentType) && !isNewFileExplorer;
  if (!canDoJIT) {
    return { isQueryable: false, isIncludable: false, isSearchable: false };
  }

  const shouldSuppressTabularHints = shouldSuppressTabularAttachmentHints({
    contentType,
    isInProjectContext,
    skipFileProcessing,
  });

  return {
    isQueryable:
      !shouldSuppressTabularHints &&
      isQueryableContentType(contentType) &&
      !hasSandboxTools, // Only use query_tables_v2 if Computer is not available.
    isIncludable:
      !shouldSuppressTabularHints &&
      isConversationIncludableFileContentType(contentType),
    isSearchable: isSearchableContentType(contentType),
  };
}

export function getAttachmentFromFileContentFragment({
  cf,
  capabilities,
}: {
  cf: FileContentFragmentType;
  capabilities: AttachmentCapabilityContext;
}): FileAttachmentType | null {
  const fileId = cf.fileId;
  if (!fileId) {
    logger.warn(
      {
        contentFragmentId: cf.sId,
        contentFragmentCreatedAt: new Date(cf.created),
      },
      "File attachment without a fileId (unsupported legacy)."
    );
    return null;
  }
  const isInProjectContext = cf.isInProjectContext === true;

  const { isQueryable, isIncludable, isSearchable } =
    computeFileAttachmentCapabilityFlags({
      contentType: cf.contentType,
      snippet: cf.snippet,
      isInProjectContext,
      skipFileProcessing: cf.skipFileProcessing === true,
      capabilities,
    });

  const creator: AttachmentCreator | null = cf.context.fullName
    ? {
        type: "user",
        name: cf.context.fullName,
        pictureUrl: cf.context.profilePictureUrl ?? "",
      }
    : null;

  const baseAttachment: BaseConversationAttachmentType = {
    title: cf.title,
    contentType: cf.contentType,
    snippet: cf.snippet,
    contentFragmentVersion: cf.contentFragmentVersion,
    // Backward compatibility: we fallback to the fileId if no generated tables are mentioned
    // but the file is queryable.
    generatedTables:
      cf.generatedTables.length > 0
        ? cf.generatedTables
        : isQueryable
          ? [fileId]
          : [],
    isIncludable,
    isQueryable,
    isSearchable,
    isInProjectContext,
    hidden: cf.hidden,
    creator,
  };

  return {
    ...baseAttachment,
    fileId,
    path: cf.path ?? null,
    processedPath: cf.processedPath ?? null,
    source: "user",
    createdAt: cf.created,
  };
}

export function makeFileAttachment({
  fileId,
  source,
  createdAt,
  updatedAt,
  contentType,
  title,
  snippet,
  isInProjectContext,
  hideFromUser,
  path = null,
  creator = null,
  capabilities,
}: {
  fileId: string;
  source: "agent" | "user" | null;
  createdAt?: number;
  updatedAt?: number;
  contentType: AllSupportedFileContentType;
  title: string;
  snippet: string | null;
  isInProjectContext: boolean;
  hideFromUser: boolean;
  path?: string | null;
  creator?: AttachmentCreator | null;
  capabilities: AttachmentCapabilityContext;
}): FileAttachmentType {
  const { isQueryable, isIncludable, isSearchable } =
    computeFileAttachmentCapabilityFlags({
      contentType,
      snippet,
      isInProjectContext,
      // Agent generated files are never sandbox raw uploads: they always go through processing.
      skipFileProcessing: false,
      capabilities,
    });

  return {
    fileId,
    path,
    source,
    createdAt,
    updatedAt,
    contentType,
    title,
    snippet,
    // For simplicity later, we always set the generatedTables to the fileId if the file is queryable for agent generated files.
    generatedTables: isQueryable ? [fileId] : [],
    contentFragmentVersion: "latest",
    isIncludable,
    isQueryable,
    isSearchable,
    isInProjectContext,
    hidden: hideFromUser,
    creator,
  };
}

export function renderLargePasteXml({
  largePaste,
  content,
  truncated = false,
  path,
}: {
  largePaste: LargePasteType;
  content: string;
  truncated?: boolean;
  path?: string;
}): string {
  const attrs = [`name="${largePaste.title}"`];
  if (truncated) {
    attrs.push('truncated="true"');
  }
  if (path) {
    attrs.push(`path="${path}"`);
  }
  return `<pastedContent ${attrs.join(" ")}>${content}</pastedContent>`;
}

/**
 * Which conversation tools the `Use:` line may point the model at. A capability flag says what the
 * attachment supports; this says what is callable in this conversation. They differ in file system
 * mode, where `conversation_files` only registers `list_content_nodes_and_tables` and `cat`.
 */
export type AttachmentUsageHints = {
  hasSemanticSearchTool: boolean;
};

export function attachmentUsageHintsFor({
  isNewFileExplorer,
}: AttachmentCapabilityContext): AttachmentUsageHints {
  return { hasSemanticSearchTool: !isNewFileExplorer };
}

function renderAttachmentUsageLine(
  attachment: ConversationAttachmentType,
  { hasSemanticSearchTool }: AttachmentUsageHints
): string | null {
  const clauses: string[] = [];

  if (attachment.isIncludable) {
    clauses.push(
      `read with \`${getPrefixedToolName(CONVERSATION_FILES_SERVER_NAME, CONVERSATION_CAT_FILE_ACTION_NAME)}\``
    );
  }
  if (attachment.isQueryable) {
    clauses.push(
      `query tabular data with \`${DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME}\``
    );
  }
  if (attachment.isSearchable && hasSemanticSearchTool) {
    clauses.push(
      `semantic search with \`${getPrefixedToolName(CONVERSATION_FILES_SERVER_NAME, CONVERSATION_SEARCH_FILES_ACTION_NAME)}\``
    );
  }

  if (clauses.length === 0) {
    return null;
  }

  return `Use: ${clauses.join("; ")}.`;
}

/**
 * `usage` is null when the caller already inlines the attachment's full content: there is nothing
 * left to retrieve, and a usage line would both contradict the content and shift the offsets
 * callers compute over the rendered text.
 */
export function renderAttachmentXml({
  attachment,
  content = null,
  usage,
}: {
  attachment: ConversationAttachmentType;
  content?: string | null;
  usage: AttachmentUsageHints | null;
}): string {
  const params = [
    `id="${conversationAttachmentId(attachment)}"`,
    `type="${attachment.contentType}"`,
    `title="${attachment.title}"`,
    `version="${attachment.contentFragmentVersion}"`,
  ];

  if (isContentNodeAttachmentType(attachment)) {
    params.push(`nodeId="${attachment.nodeId}"`);
    if (attachment.sourceUrl) {
      params.push(`sourceUrl="${attachment.sourceUrl}"`);
    }
  }

  const usageLine = usage ? renderAttachmentUsageLine(attachment, usage) : null;
  const contentToRender = content ?? attachment.snippet;
  const bodyParts = [usageLine, contentToRender].filter(
    (part): part is string => part != null && part !== ""
  );

  if (bodyParts.length > 0) {
    return `<attachment ${params.join(" ")}>${bodyParts.join("\n")}\n</attachment>`;
  }

  return `<attachment ${params.join(" ")}/>`;
}
