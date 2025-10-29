import TurndownService from "turndown";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import { fetchIntercomConversation } from "@connectors/connectors/intercom/lib/intercom_api";
import type {
  ConversationPartType,
  IntercomConversationWithPartsType,
  IntercomTagType,
} from "@connectors/connectors/intercom/lib/types";
import {
  getConversationInAppUrl,
  getConversationInternalId,
  getTeamInternalId,
  getTeamsInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import { filterCustomTags } from "@connectors/connectors/shared/tags";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import {
  IntercomConversationModel,
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

const turndownService = new TurndownService();

export async function deleteTeamAndConversations({
  connectorId,
  dataSourceConfig,
  team,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  team: IntercomTeamModel;
}) {
  const conversations = await IntercomConversationModel.findAll({
    where: {
      connectorId,
      teamId: team.teamId,
    },
  });

  await concurrentExecutor(
    conversations,
    (conversation) =>
      deleteConversation({
        connectorId,
        conversationId: conversation.conversationId,
        dataSourceConfig,
      }),
    { concurrency: 10 }
  );

  // Delete datasource team node
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: getTeamInternalId(connectorId, team.teamId),
  });

  await team.destroy();
}

export async function deleteConversation({
  connectorId,
  conversationId,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  conversationId: string;
  dataSourceConfig: DataSourceConfig;
}) {
  const dsConversationId = getConversationInternalId(
    connectorId,
    conversationId
  );
  await Promise.all([
    deleteDataSourceDocument(dataSourceConfig, dsConversationId),
    IntercomConversationModel.destroy({
      where: {
        connectorId,
        conversationId,
      },
    }),
  ]);
}

export async function fetchAndSyncConversation({
  connectorId,
  connectionId,
  dataSourceConfig,
  conversationId,
  currentSyncMs,
  syncType,
  loggerArgs,
}: {
  connectorId: ModelId;
  connectionId: string;
  dataSourceConfig: DataSourceConfig;
  conversationId: string;
  currentSyncMs: number;
  syncType: "incremental" | "batch";
  loggerArgs: Record<string, string | number | null>;
}) {
  const accessToken = await getIntercomAccessToken(connectionId);
  const conversation = await fetchIntercomConversation({
    accessToken,
    conversationId,
  });

  if (!conversation) {
    logger.error("[Intercom] Failed to fetch conversation", {
      conversationId,
      loggerArgs,
    });
    return;
  }

  await syncConversation({
    connectorId,
    dataSourceConfig,
    conversation,
    currentSyncMs,
    syncType,
    loggerArgs,
  });
}

export async function syncConversation({
  connectorId,
  dataSourceConfig,
  conversation,
  currentSyncMs,
  syncType,
  loggerArgs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  conversation: IntercomConversationWithPartsType;
  currentSyncMs: number;
  syncType: "incremental" | "batch";
  loggerArgs: Record<string, string | number | null>;
}) {
  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: {
      connectorId,
    },
  });
  if (!intercomWorkspace) {
    logger.error("[Intercom] IntercomWorkspace not found", {
      connectorId,
      loggerArgs,
    });
    return;
  }

  const conversationTeamId = conversation.team_assignee_id?.toString() ?? null;

  const syncAllActivated =
    intercomWorkspace.syncAllConversations === "activated" ||
    intercomWorkspace.syncAllConversations === "scheduled_activate";
  if (!syncAllActivated) {
    if (!conversationTeamId) {
      logger.error(
        "[Intercom] Conversation has no team assignee & sync all convo is not activated. Skipping sync",
        {
          conversationId: conversation.id,
          loggerArgs,
        }
      );
      return;
    }
    const team = await IntercomTeamModel.findOne({
      where: {
        connectorId,
        teamId: conversationTeamId,
      },
    });
    if (!team || team.permission !== "read") {
      logger.error(
        "[Intercom] Conversation team unknown or non allowed while sync all convo is disabled. Skipping sync",
        { conversationId: conversation.id, loggerArgs }
      );
      return;
    }
  }

  const conversationOnDB = await IntercomConversationModel.findOne({
    where: {
      connectorId,
      conversationId: conversation.id,
    },
  });

  const createdAtDate = new Date(conversation.created_at * 1000);
  const updatedAtDate = new Date(conversation.updated_at * 1000);

  if (!conversationOnDB) {
    await IntercomConversationModel.create({
      connectorId,
      conversationId: conversation.id,
      teamId: conversationTeamId,
      conversationCreatedAt: createdAtDate,
      lastUpsertedTs: new Date(currentSyncMs),
    });
  } else {
    await conversationOnDB.update({
      teamId: conversationTeamId,
      conversationCreatedAt: createdAtDate,
      lastUpsertedTs: new Date(currentSyncMs),
    });
  }

  // Building the markdown content for the conversation
  let markdown = "";
  let convoTitle = conversation.title;

  if (!convoTitle) {
    const formattedDate = createdAtDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    convoTitle = `Conversation from ${formattedDate}`;
  }
  const customAttributes = conversation.custom_attributes;
  const tags = conversation.tags?.tags ?? [];
  const tagsAsString = tags.map((tag: IntercomTagType) => tag.name).join(", ");
  const source = conversation.source.type;

  const firstMessageAuthor = conversation.source.author;
  const firstMessageContent = turndownService.turndown(
    conversation.source.body
  );

  markdown += `# ${convoTitle}\n\n`;
  markdown += `**TAGS: ${tagsAsString ?? "no tags"}**\n`;
  markdown += `**SOURCE: ${source || "unknown"}**\n`;
  markdown += `**CUSTOM ATTRIBUTES: ${JSON.stringify(customAttributes)}**\n\n`;
  markdown += `**[Message] ${firstMessageAuthor.name} (${firstMessageAuthor.type})**\n`;
  markdown += `${firstMessageContent}\n\n`;

  conversation.conversation_parts.conversation_parts.forEach(
    (part: ConversationPartType) => {
      const messageAuthor = part.author;
      const messageContent = part.body
        ? turndownService.turndown(part.body)
        : null;
      const type = part.part_type === "note" ? "Internal note" : "Message";

      const shouldSync =
        part.part_type !== "note" || intercomWorkspace.shouldSyncNotes;

      if (messageContent && shouldSync) {
        markdown += `**[${type}] ${messageAuthor.name} (${messageAuthor.type})**\n`;
        markdown += `${messageContent}\n\n`;
      }
    }
  );

  const renderedMarkdown = await renderMarkdownSection(
    dataSourceConfig,
    markdown
  );

  const renderedPage = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: conversation.title,
    content: renderedMarkdown,
    createdAt: createdAtDate,
    updatedAt: updatedAtDate,
  });

  const conversationUrl = getConversationInAppUrl(
    intercomWorkspace.intercomWorkspaceId,
    conversation.id,
    intercomWorkspace.region
  );

  // Datasource TAGS
  const systemTags = [
    `title:${convoTitle}`,
    `createdAt:${createdAtDate.getTime()}`,
    `updatedAt:${updatedAtDate.getTime()}`,
  ];

  Object.entries(customAttributes).forEach(([name, value]) => {
    if (
      (typeof value === "string" && value.length > 0) ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      systemTags.push(`attribute:${name}:${value}`);
    }
  });

  const customTags: string[] = [];
  tags.forEach((tag) => {
    customTags.push(`tag:${tag.name}`);
  });

  const datasourceTags = [
    ...systemTags,
    ...filterCustomTags(customTags, logger),
  ];

  // parents in the Core datasource map the internal ids that are used in the permission system
  // they self reference the document id
  const documentId = getConversationInternalId(connectorId, conversation.id);
  const parents = [documentId];
  if (conversationTeamId) {
    parents.push(getTeamInternalId(connectorId, conversationTeamId));
  }
  if (syncAllActivated) {
    parents.push(getTeamsInternalId(connectorId));
  }

  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent: renderedPage,
    documentUrl: conversationUrl,
    timestampMs: updatedAtDate.getTime(),
    tags: datasourceTags,
    parents,
    parentId: parents[1] || null,
    loggerArgs: {
      ...loggerArgs,
      conversationId: conversation.id,
    },
    upsertContext: {
      sync_type: syncType,
    },
    title: convoTitle,
    mimeType: INTERNAL_MIME_TYPES.INTERCOM.CONVERSATION,
    async: true,
  });
}
