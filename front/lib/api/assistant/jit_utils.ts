import {
  CONTENT_NODE_MIME_TYPES,
  isDustMimeType,
  isIncludableInternalMimeType,
} from "@dust-tt/client";

import type {
  BaseConversationAttachmentType,
  ConversationAttachmentType,
  ConversationContentNodeType,
} from "@app/lib/actions/conversation/list_files";
import type {
  ConversationType,
  SupportedContentFragmentType,
} from "@app/types";
import {
  isAgentMessageType,
  isContentFragmentType,
  isContentNodeAttachment,
  isFileAttachment,
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

function isListableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  // We allow listing all content-types that are not images.
  return !isSupportedImageContentType(contentType);
}

// Moved to a separate file to avoid circular dependency issue.
export function listFiles(
  conversation: ConversationType
): ConversationAttachmentType[] {
  const files: ConversationAttachmentType[] = [];
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (
      isContentFragmentType(m) &&
      isListableContentType(m.contentType) &&
      m.contentFragmentVersion === "latest"
    ) {
      if (isFileAttachment(m) || isContentNodeAttachment(m)) {
        // Here, snippet not null is actually to detect file attachments that are prior to the JIT
        // actions, and differentiate them from the newer file attachments that do have a snippet.
        // Former ones cannot be used in JIT. But for content node fragments, with a node id rather
        // than a file id, we don't care about the snippet.
        const canDoJIT = m.snippet !== null || isContentNodeAttachment(m);
        const isQueryable =
          canDoJIT &&
          (isQueryableContentType(m.contentType) || m.nodeType === "table");
        const isContentNodeTable = isContentNodeAttachment(m) && isQueryable;
        const isIncludable =
          m.nodeType !== "folder" &&
          isConversationIncludableFileContentType(m.contentType) &&
          // Tables from knowledge are not materialized as raw content. As such, they cannot be
          // included.
          !isContentNodeTable;
        // Tables from knowledge are not materialized as raw content. As such, they cannot be
        // searched--except for notion databases, that may have children.
        const isUnmaterializedTable =
          isContentNodeTable &&
          m.contentType !== CONTENT_NODE_MIME_TYPES.NOTION.DATABASE;
        const isSearchable =
          canDoJIT &&
          isSearchableContentType(m.contentType) &&
          !isUnmaterializedTable;
        const isExtractable =
          canDoJIT &&
          isExtractableContentType(m.contentType) &&
          !isUnmaterializedTable;
        const baseAttachment: BaseConversationAttachmentType = {
          title: m.title,
          contentType: m.contentType,
          snippet: m.snippet,
          contentFragmentVersion: m.contentFragmentVersion,
          // Backward compatibility: we fallback to the fileId if no generated tables are mentionned
          // but the file is queryable.
          generatedTables:
            m.generatedTables.length > 0
              ? m.generatedTables
              : isQueryable
                ? [
                    m.fileId ||
                      m.nodeId ||
                      "unreachable_either_file_id_or_node_id_must_be_present",
                  ]
                : [],
          isIncludable,
          isQueryable,
          isSearchable,
          isExtractable,
        };

        if (isContentNodeAttachment(m)) {
          files.push({
            ...baseAttachment,
            nodeDataSourceViewId: m.nodeDataSourceViewId,
            contentFragmentId: m.contentFragmentId,
            nodeId: m.nodeId,
            nodeType: m.nodeType,
          });
        }

        if (isFileAttachment(m)) {
          files.push({
            ...baseAttachment,
            fileId: m.fileId,
          });
        }
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
