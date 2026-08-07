// Okay to use public API types because here front is talking to core API.

import { fetchContentFragmentsForConversation } from "@app/lib/api/assistant/content_fragments";
import { getAttachmentCapabilityContext } from "@app/lib/api/assistant/conversation/attachment_capabilities";
import {
  getAttachmentFromContentFragment,
  makeFileAttachment,
} from "@app/lib/api/assistant/conversation/attachments";
import { truncateLegacyPastedSnippet } from "@app/lib/api/files/snippet";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type {
  ContentNodeAttachmentType,
  ConversationAttachmentType,
} from "@app/types/api/assistant/conversation/attachments";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { CONTENT_NODE_MIME_TYPES } from "@dust-tt/client";

export async function listAttachments(
  auth: Authenticator,
  {
    conversation,
    upToRank,
  }: {
    conversation: ConversationWithoutContentType | ConversationResource;
    /** When set, only attachments from messages with `rank <= upToRank` are included. */
    upToRank?: number;
  }
): Promise<ConversationAttachmentType[]> {
  // Using a map to avoid duplicated, order matters, project files should override directly
  // attached files as they could have been moved from conversation to project.
  const attachments: Map<string, ConversationAttachmentType> = new Map();

  const [contentFragments, generatedFiles] = await Promise.all([
    fetchContentFragmentsForConversation(auth, {
      conversation,
      upToRank,
    }),
    AgentMCPActionResource.listGeneratedFilesForConversation(auth, {
      conversationId: conversation.id,
      upToRank,
    }),
  ]);

  const capabilities = await getAttachmentCapabilityContext(auth, conversation);

  for (const m of contentFragments) {
    const attachment = getAttachmentFromContentFragment({
      cf: m,
      capabilities,
    });
    if (attachment) {
      attachments.set(
        m.contentFragmentId,
        truncateLegacyPastedSnippet(attachment)
      );
    }
  }

  for (const f of generatedFiles) {
    attachments.set(
      f.fileId,
      makeFileAttachment({
        fileId: f.fileId,
        source: "agent",
        createdAt: f.createdAt ?? 0,
        updatedAt: f.updatedAt ?? 0,
        contentType: f.contentType,
        title: f.title,
        snippet: f.snippet,
        isInProjectContext: f.isInProjectContext ?? false,
        hideFromUser: f.hidden ?? false,
        creator: f.creator,
        capabilities,
      })
    );
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
