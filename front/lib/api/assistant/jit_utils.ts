// Okay to use public API types because here front is talking to core API.

import type {
  ContentNodeAttachmentType,
  ConversationAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  getAttachmentFromContentFragment,
  getAttachmentFromFile,
} from "@app/lib/api/assistant/conversation/attachments";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isProjectConversation,
} from "@app/types/assistant/conversation";
import { isContentFragmentType } from "@app/types/content_fragment";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { CONTENT_NODE_MIME_TYPES } from "@dust-tt/client";

export async function listAttachments(
  auth: Authenticator,
  { conversation }: { conversation: ConversationType }
): Promise<ConversationAttachmentType[]> {
  // Using a map to avoid duplicated, order matters, project files should override directly attached files as they could have be moved from conversation to project.
  const attachments: Map<string, ConversationAttachmentType> = new Map();
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];
    if (isContentFragmentType(m)) {
      // Only list the latest version of a content fragment.
      if (m.contentFragmentVersion !== "latest") {
        continue;
      }

      const attachment = getAttachmentFromContentFragment(m);
      if (attachment) {
        attachments.set(m.contentFragmentId, attachment);
      }
    } else if (isAgentMessageType(m)) {
      const generatedFiles = m.actions.flatMap((a) => a.generatedFiles);

      for (const f of generatedFiles) {
        attachments.set(
          f.fileId,
          getAttachmentFromFile({
            fileId: f.fileId,
            contentType: f.contentType,
            title: f.title,
            snippet: f.snippet,
            isInProjectContext: f.isInProjectContext ?? false,
          })
        );
      }
    }
  }

  if (isProjectConversation(conversation)) {
    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (!space) {
      logger.warn(
        { conversationId: conversation.sId, spaceId: conversation.spaceId },
        "Space not found for conversation"
      );
    } else {
      const files = await FileResource.listByProject(auth, {
        projectId: space.sId,
      });

      for (const f of files) {
        attachments.set(
          f.sId,
          getAttachmentFromFile({
            fileId: f.sId,
            contentType: f.contentType,
            title: f.fileName,
            snippet: null,
            isInProjectContext: true,
          })
        );
      }
    }
  }

  return Array.from(attachments.values());
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
