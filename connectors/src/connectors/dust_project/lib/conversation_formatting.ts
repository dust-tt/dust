import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import { renderDocumentTitleAndContent } from "@connectors/lib/data_sources";
import { formatDateForUpsert } from "@connectors/lib/formatting";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types";
import type { ConversationPublicType } from "@dust-tt/client";

/**
 * Formats raw conversation content into a plain text document section for data source upsert.
 * This creates a simple text representation suitable for indexing.
 */

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export  async function formatConversationForUpsert({
  dataSourceConfig,
  conversation,
}: {
  dataSourceConfig: DataSourceConfig;
  conversation: ConversationPublicType;
}): Promise<CoreAPIDataSourceDocumentSection> {
  // Convert conversation content to document sections
  const messageSections: CoreAPIDataSourceDocumentSection[] = [];

  for (const versions of conversation.content) {
    // Only take the last version of each rank
    const msg = versions[versions.length - 1];

    if (!msg) {
      continue;
    }

    let prefix: string | null = null;
    let content: string | null = null;
    const dateStr: string = formatDateForUpsert(new Date(msg.created));

    if (msg.type === "user_message") {
      const userName = msg.user?.fullName || msg.user?.username || "User";
      const userEmail = msg.user?.email || "Unknown";
      prefix = `>> User (${userName}, ${userEmail}) [${dateStr}]:\n`;
      content = msg.content ? msg.content + "\n" : "\n";
    } else if (msg.type === "agent_message") {
      const agentName = msg.configuration?.name || "Assistant";
      prefix = `>> Assistant (${agentName}) [${dateStr}]:\n`;

      if (msg.content) {
        content = msg.content + "\n";
      } else {
        logger.warn({ msg }, "Agent message has no content");
        content = "\n";
      }
    } else if (msg.type === "content_fragment") {
      prefix = `>> Content Fragment [${dateStr}]:\n`;
      content = "ID: " + msg.contentFragmentId + "\n";
      content += "Content-Type: " + msg.contentType + "\n";
      content += "Title: " + msg.title + "\n";
      content += "Version: " + msg.version + "\n";
      content += "Source URL: " + msg.sourceUrl + "\n";
    }

    if (prefix !== null && content !== null) {
      messageSections.push({
        prefix,
        content:
          msg.visibility === "deleted" ? "Deleted message\n" : content.trim(),
        sections: [],
      });
    }
  }

  const contentSection: CoreAPIDataSourceDocumentSection = {
    // Create the main content section with all messages
    prefix: null,
    content: null,
    sections: messageSections,
  };

  // Use renderDocumentTitleAndContent to add metadata
  return renderDocumentTitleAndContent({
    dataSourceConfig,
    title: conversation.title || `Conversation ${conversation.id}`,
    createdAt: new Date(conversation.created),
    updatedAt: new Date(conversation.updated ?? conversation.created),

    content: contentSection,
  });
}

/**
 * Generates internal IDs for conversation folders and messages.
 * These IDs are used in the parents field of data source documents.
 */
export function getConversationFolderInternalId(
  connectorId: number,
  projectId: string
): string {
  return `dust-project-${connectorId}-project-${projectId}`;
}

export function getConversationMessageInternalId(
  connectorId: number,
  projectId: string,
  conversationId: string
): string {
  return `dust-project-${connectorId}-project-${projectId}-conversation-${conversationId}`;
}
