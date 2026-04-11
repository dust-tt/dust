import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import { renderDocumentTitleAndContent } from "@connectors/lib/data_sources";
import { formatDateForUpsert } from "@connectors/lib/formatting";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types";
import type { ConversationPublicType } from "@dust-tt/client";

/** Max messages (user / agent / content_fragment) per Core document to avoid upsert size limits. */
export const CONVERSATION_MESSAGES_PER_DOCUMENT = 256;

/**
 * Builds one document section per message (last version per rank) for indexing.
 */
export function buildConversationMessageSections(
  conversation: ConversationPublicType
): CoreAPIDataSourceDocumentSection[] {
  const messageSections: CoreAPIDataSourceDocumentSection[] = [];

  for (const versions of conversation.content) {
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

  return messageSections;
}

/**
 * Splits message sections into chunks of at most {@link CONVERSATION_MESSAGES_PER_DOCUMENT} messages each.
 * Empty conversations yield a single empty chunk so we still emit one document.
 */
export function chunkMessageSectionsForDocuments(
  sections: CoreAPIDataSourceDocumentSection[]
): CoreAPIDataSourceDocumentSection[][] {
  const size = CONVERSATION_MESSAGES_PER_DOCUMENT;
  if (sections.length === 0) {
    return [[]];
  }
  const chunks: CoreAPIDataSourceDocumentSection[][] = [];
  for (let i = 0; i < sections.length; i += size) {
    chunks.push(sections.slice(i, i + size));
  }
  return chunks;
}

/**
 * Title for a Core document: base conversation title, with ` (part i of n)` when split across multiple documents.
 */
export function getConversationDocumentUpsertTitle(
  conversation: ConversationPublicType,
  partIndex: number,
  totalParts: number
): string {
  const base = conversation.title || `Conversation ${conversation.sId}`;
  if (totalParts <= 1) {
    return base;
  }
  return `${base} (part ${partIndex} of ${totalParts})`;
}

/**
 * Formats a slice of message sections into the Core document payload (title + metadata + sections).
 */
export async function formatConversationSectionsForUpsert({
  dataSourceConfig,
  conversation,
  sections,
  partIndex,
  totalParts,
}: {
  dataSourceConfig: DataSourceConfig;
  conversation: ConversationPublicType;
  sections: CoreAPIDataSourceDocumentSection[];
  partIndex: number;
  totalParts: number;
}): Promise<CoreAPIDataSourceDocumentSection> {
  const contentSection: CoreAPIDataSourceDocumentSection = {
    prefix: null,
    content: null,
    sections,
  };

  const title = getConversationDocumentUpsertTitle(
    conversation,
    partIndex,
    totalParts
  );

  return renderDocumentTitleAndContent({
    dataSourceConfig,
    title,
    createdAt: new Date(conversation.created),
    updatedAt: new Date(conversation.updated ?? conversation.created),

    content: contentSection,
  });
}

/**
 * Formats full conversation into a single document (used when chunking is not required by caller).
 */
export async function formatConversationForUpsert({
  dataSourceConfig,
  conversation,
}: {
  dataSourceConfig: DataSourceConfig;
  conversation: ConversationPublicType;
}): Promise<CoreAPIDataSourceDocumentSection> {
  const sections = buildConversationMessageSections(conversation);
  return formatConversationSectionsForUpsert({
    dataSourceConfig,
    conversation,
    sections,
    partIndex: 1,
    totalParts: 1,
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

/**
 * Document id for a split conversation (part 1..N). Not used when the conversation fits in one document.
 */
export function getConversationPartDocumentInternalId(
  baseConversationDocumentId: string,
  partNumber: number
): string {
  return `${baseConversationDocumentId}-part-${partNumber}`;
}
