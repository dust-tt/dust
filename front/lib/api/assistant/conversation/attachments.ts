// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { CONTENT_NODE_MIME_TYPES } from "@dust-tt/client";

import {
  isConversationIncludableFileContentType,
  isQueryableContentType,
  isSearchableContentType,
} from "@app/lib/api/assistant/conversation/content_types";
import logger from "@app/logger/logger";
import type {
  ContentFragmentInputWithContentNode,
  ContentFragmentType,
  ContentFragmentVersion,
  ContentNodeContentFragmentType,
  ContentNodeType,
  FileContentFragmentType,
  SupportedContentFragmentType,
  SupportedFileContentType,
} from "@app/types";
import {
  assertNever,
  DATA_SOURCE_NODE_ID,
  isContentNodeContentFragment,
  isFileContentFragment,
} from "@app/types";

export type BaseConversationAttachmentType = {
  title: string;
  contentType: SupportedContentFragmentType;
  contentFragmentVersion: ContentFragmentVersion;
  snippet: string | null;
  generatedTables: string[];
  isIncludable: boolean;
  isSearchable: boolean;
  isQueryable: boolean;
};

export type FileAttachmentType = BaseConversationAttachmentType & {
  fileId: string;
};

export type ContentNodeAttachmentType = BaseConversationAttachmentType & {
  contentFragmentId: string;
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
};

export type ConversationAttachmentType =
  | FileAttachmentType
  | ContentNodeAttachmentType;

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

export function getAttachmentFromContentFragment(
  cf: ContentFragmentType
): ConversationAttachmentType | null {
  if (isContentNodeContentFragment(cf)) {
    return getAttachmentFromContentNodeContentFragment(cf);
  }
  if (isFileContentFragment(cf)) {
    return getAttachmentFromFileContentFragment(cf);
  }
  assertNever(cf);
}

function getAttachmentFromContentNodeContentFragment(
  cf: ContentNodeContentFragmentType
): ContentNodeAttachmentType {
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
  };

  return {
    ...baseAttachment,
    nodeDataSourceViewId: cf.nodeDataSourceViewId,
    contentFragmentId: cf.contentFragmentId,
    nodeId: cf.nodeId,
    nodeType: cf.nodeType,
  };
}

function getAttachmentFromFileContentFragment(
  cf: FileContentFragmentType
): FileAttachmentType | null {
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

  // Here, snippet not null is actually to detect file attachments that are prior to the JIT
  // actions, and differentiate them from the newer file attachments that do have a snippet.
  // Former ones cannot be used in JIT.
  const canDoJIT = cf.snippet !== null;
  const isQueryable = canDoJIT && isQueryableContentType(cf.contentType);
  const isIncludable = isConversationIncludableFileContentType(cf.contentType);
  const isSearchable = canDoJIT && isSearchableContentType(cf.contentType);
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
  };

  return {
    ...baseAttachment,
    fileId,
  };
}

export function getAttachmentFromToolOutput({
  fileId,
  contentType,
  title,
  snippet,
}: {
  fileId: string;
  contentType: SupportedFileContentType;
  title: string;
  snippet: string | null;
}): FileAttachmentType {
  const canDoJIT = snippet !== null;
  const isIncludable = isConversationIncludableFileContentType(contentType);
  const isQueryable = canDoJIT && isQueryableContentType(contentType);
  const isSearchable = canDoJIT && isSearchableContentType(contentType);

  return {
    fileId,
    contentType,
    title,
    snippet,
    // For simplicity later, we always set the generatedTables to the fileId if the file is queryable for agent generated files.
    generatedTables: isQueryable ? [fileId] : [],
    contentFragmentVersion: "latest",
    isIncludable,
    isQueryable,
    isSearchable,
  };
}

export function renderAttachmentXml({
  attachment,
  content = null,
}: {
  attachment: ConversationAttachmentType;
  content?: string | null;
}): string {
  const params = [
    `id="${conversationAttachmentId(attachment)}"`,
    `type="${attachment.contentType}"`,
    `title="${attachment.title}"`,
    `version="${attachment.contentFragmentVersion}"`,
    `isIncludable="${attachment.isIncludable}"`,
    `isQueryable="${attachment.isQueryable}"`,
    `isSearchable="${attachment.isSearchable}"`,
  ];

  let tag = `<attachment ${params.join(" ")}`;

  const contentToRender = content ?? attachment.snippet;

  if (contentToRender) {
    tag += `>${contentToRender}\n</attachment>`;
  } else {
    tag += "/>";
  }

  return tag;
}
