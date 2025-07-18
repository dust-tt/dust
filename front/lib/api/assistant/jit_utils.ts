import { CONTENT_NODE_MIME_TYPES } from "@dust-tt/client";

import type {
  ContentNodeAttachmentType,
  ConversationAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  getAttachmentFromContentFragment,
  getAttachmentFromToolOutput,
} from "@app/lib/api/assistant/conversation/attachments";
import type { ConversationType } from "@app/types";
import {
  isAgentMessageType,
  isContentFragmentType,
  isInteractiveFileContentType,
  isSupportedImageContentType,
} from "@app/types";

export function listAttachments(
  conversation: ConversationType
): ConversationAttachmentType[] {
  const attachments: ConversationAttachmentType[] = [];
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

      attachments.push(getAttachmentFromContentFragment(m));
    } else if (isAgentMessageType(m)) {
      const generatedFiles = m.actions.flatMap((a) => a.getGeneratedFiles());

      for (const f of generatedFiles) {
        // Interactive files should not be shown in the JIT.
        if (isInteractiveFileContentType(f.contentType)) {
          continue;
        }

        attachments.push(
          getAttachmentFromToolOutput({
            fileId: f.fileId,
            contentType: f.contentType,
            title: f.title,
            snippet: f.snippet,
          })
        );
      }
    } else {
      continue;
    }
  }

  return attachments;
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
export function isSearchableFolder(m: ContentNodeAttachmentType): boolean {
  return (
    (m.nodeType === "folder" ||
      m.contentType === CONTENT_NODE_MIME_TYPES.NOTION.PAGE ||
      m.contentType === CONTENT_NODE_MIME_TYPES.NOTION.DATABASE) &&
    m.contentType !== CONTENT_NODE_MIME_TYPES.MICROSOFT.SPREADSHEET &&
    m.contentType !== CONTENT_NODE_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET
  );
}
