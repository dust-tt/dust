import {
  assertNever,
  CONTENT_NODE_MIME_TYPES,
  isDustMimeType,
  isIncludableInternalMimeType,
} from "@dust-tt/client";
import assert from "assert";

import type {
  BaseConversationAttachmentType,
  ConversationAttachmentType,
  ConversationContentNodeType,
  ConversationFileType,
} from "@app/lib/actions/conversation/list_files";
import type {
  ContentNodeContentFragmentType,
  ConversationType,
  FileContentFragmentType,
  SupportedContentFragmentType,
} from "@app/types";
import {
  isAgentMessageType,
  isContentFragmentType,
  isContentNodeContentFragment,
  isFileContentFragment,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
} from "@app/types";

function isConversationIncludableFileContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isDustMimeType(contentType)) {
    return isIncludableInternalMimeType(contentType);
  }
  return true;
}

function isQueryableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  // For now we only allow querying tabular files and multi-sheet spreadsheets
  // from connections.
  if (
    isSupportedDelimitedTextContentType(contentType) ||
    isMultiSheetSpreadsheetContentType(contentType)
  ) {
    return true;
  }
  return false;
}

export function isMultiSheetSpreadsheetContentType(
  contentType: SupportedContentFragmentType
): contentType is
  | typeof CONTENT_NODE_MIME_TYPES.MICROSOFT.SPREADSHEET
  | typeof CONTENT_NODE_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET {
  return (
    contentType === CONTENT_NODE_MIME_TYPES.MICROSOFT.SPREADSHEET ||
    contentType === CONTENT_NODE_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET
  );
}

function isSearchableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  if (isSupportedDelimitedTextContentType(contentType)) {
    return false;
  }
  // For now we allow searching everything else.
  return true;
}

function isExtractableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  return true;
}

export function getContentFragmentFileAttachment(
  cf: FileContentFragmentType
): ConversationFileType {
  const fileId = cf.fileId;
  assert(fileId, `File attachment must have a fileId (sId: ${cf.sId})`);

  // Here, snippet not null is actually to detect file attachments that are prior to the JIT
  // actions, and differentiate them from the newer file attachments that do have a snippet.
  // Former ones cannot be used in JIT.
  const canDoJIT = cf.snippet !== null;
  const isQueryable = canDoJIT && isQueryableContentType(cf.contentType);
  const isIncludable = isConversationIncludableFileContentType(cf.contentType);
  const isSearchable = canDoJIT && isSearchableContentType(cf.contentType);
  const isExtractable = canDoJIT && isExtractableContentType(cf.contentType);
  const baseAttachment: BaseConversationAttachmentType = {
    title: cf.title,
    contentType: cf.contentType,
    snippet: cf.snippet,
    contentFragmentVersion: cf.contentFragmentVersion,
    // Backward compatibility: we fallback to the fileId if no generated tables are mentionned
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
    isExtractable,
  };

  return {
    ...baseAttachment,
    fileId,
  };
}

export function getContentFragmentContentNodeAttachment(
  cf: ContentNodeContentFragmentType
): ConversationContentNodeType {
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
  const isExtractable =
    isExtractableContentType(cf.contentType) && !isUnmaterializedTable;

  const baseAttachment: BaseConversationAttachmentType = {
    title: cf.title,
    contentType: cf.contentType,
    snippet: null,
    contentFragmentVersion: cf.contentFragmentVersion,
    // Backward compatibility: we fallback to the fileId if no generated tables are mentionned
    // but the file is queryable.
    generatedTables: isQueryable ? [cf.nodeId] : [],
    isIncludable,
    isQueryable,
    isSearchable,
    isExtractable,
  };

  return {
    ...baseAttachment,
    nodeDataSourceViewId: cf.nodeDataSourceViewId,
    contentFragmentId: cf.contentFragmentId,
    nodeId: cf.nodeId,
    nodeType: cf.nodeType,
  };
}

export function listFiles(
  conversation: ConversationType
): ConversationAttachmentType[] {
  const files: ConversationAttachmentType[] = [];
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (isContentFragmentType(m)) {
      // We don't list images.
      if (isSupportedImageContentType(m.contentType)) {
        continue;
      }

      // Only list the latest version of a content fragment.
      if (m.contentFragmentVersion !== "latest") {
        continue;
      }

      if (isFileContentFragment(m)) {
        files.push(getContentFragmentFileAttachment(m));
      } else if (isContentNodeContentFragment(m)) {
        files.push(getContentFragmentContentNodeAttachment(m));
      } else {
        assertNever(m);
      }
    } else if (isAgentMessageType(m)) {
      const generatedFiles = m.actions.flatMap((a) => a.getGeneratedFiles());

      for (const f of generatedFiles) {
        const canDoJIT = f.snippet != null;
        const isIncludable = isConversationIncludableFileContentType(
          f.contentType
        );
        const isQueryable = canDoJIT && isQueryableContentType(f.contentType);
        const isSearchable = canDoJIT && isSearchableContentType(f.contentType);
        const isExtractable =
          canDoJIT && isExtractableContentType(f.contentType);

        files.push({
          fileId: f.fileId,
          contentType: f.contentType,
          title: f.title,
          snippet: f.snippet,
          // For simplicity later, we always set the generatedTables to the fileId if the file is queryable for agent generated files.
          generatedTables: isQueryable ? [f.fileId] : [],
          contentFragmentVersion: "latest",
          isIncludable,
          isQueryable,
          isSearchable,
          isExtractable,
        });
      }
    } else {
      continue;
    }
  }

  return files;
}

/**
 * Searchable Folders are almost always content nodes with type "folder", with 2
 * exceptions:
 * - Notion pages and databases, which are not of type "folder" but may contain
 *   other pages or databases; as such, they are "searchable folders";
 * - spreadsheets with multiple sheets, which are of type "folder" (since they
 *   have multiple children) but are not searchable; their children are
 *   table-queryable only.
 */
export function isSearchableFolder(m: ConversationContentNodeType): boolean {
  return (
    (m.nodeType === "folder" ||
      m.contentType === CONTENT_NODE_MIME_TYPES.NOTION.PAGE ||
      m.contentType === CONTENT_NODE_MIME_TYPES.NOTION.DATABASE) &&
    m.contentType !== CONTENT_NODE_MIME_TYPES.MICROSOFT.SPREADSHEET &&
    m.contentType !== CONTENT_NODE_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET
  );
}
