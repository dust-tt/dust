import type { ModelId } from "@dust-tt/types";
import TurndownService from "turndown";

import type {
  ConversationPartType,
  IntercomTagType,
} from "@connectors/connectors/intercom/lib/intercom_api";
import { fetchIntercomConversation } from "@connectors/connectors/intercom/lib/intercom_api";
import {
  getConversationInternalId,
  getTeamInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteFromDataSource,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import type { IntercomTeam } from "@connectors/lib/models/intercom";
import {
  IntercomConversation,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
const turndownService = new TurndownService();

export async function deleteTeamAndConversations({
  connectorId,
  dataSourceConfig,
  team,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  team: IntercomTeam;
}) {
  const conversations = await IntercomConversation.findAll({
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
    deleteFromDataSource(
      {
        dataSourceName: dataSourceConfig.dataSourceName,
        workspaceId: dataSourceConfig.workspaceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      dsConversationId
    ),
    IntercomConversation.destroy({
      where: {
        connectorId,
        conversationId,
      },
    }),
  ]);
}

export async function syncConversation({
  connectorId,
  nangoConnectionId,
  dataSourceConfig,
  teamId,
  conversationId,
  currentSyncMs,
  loggerArgs,
}: {
  connectorId: ModelId;
  nangoConnectionId: string;
  dataSourceConfig: DataSourceConfig;
  teamId: string;
  conversationId: string;
  currentSyncMs: number;
  loggerArgs: Record<string, string | number>;
}) {
  const conversation = await fetchIntercomConversation({
    nangoConnectionId,
    conversationId,
  });

  if (!conversation) {
    logger.error("[Intercom] Failed to fetch conversation", {
      conversationId,
      loggerArgs,
    });
    return;
  }

  const intercomWorkspace = await IntercomWorkspace.findOne({
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

  let conversationOnDB = await IntercomConversation.findOne({
    where: {
      connectorId,
      conversationId: conversation.id,
    },
  });

  if (!conversationOnDB) {
    conversationOnDB = await IntercomConversation.create({
      connectorId,
      conversationId: conversation.id,
      teamId: conversation.team_assignee_id,
      conversationCreatedAt: conversation.created_at,
      lastUpsertedTs: new Date(currentSyncMs),
    });
  }

  // Building the markdown content for the conversation
  let markdown = "";
  const convoTitle = turndownService.turndown(conversation.source.subject);
  const tags = conversation.tags?.tags
    .map((tag: IntercomTagType) => tag.name)
    .join(", ");
  const firstMessageAuthor = conversation.source.author;
  const firstMessageContent = turndownService.turndown(
    conversation.source.body
  );

  markdown += `# ${convoTitle}\n\n`;
  markdown += `**TAGS: ${tags || "no tags"}**\n\n`;
  markdown += `**[Message] ${firstMessageAuthor.name} (${firstMessageAuthor.type})**\n`;
  markdown += `${firstMessageContent}\n\n`;

  conversation.conversation_parts.conversation_parts.forEach(
    (part: ConversationPartType) => {
      const messageAuthor = part.author;
      const messageContent = part.body
        ? turndownService.turndown(part.body)
        : null;
      const type = part.part_type === "note" ? "Internal note" : "Message";

      if (messageContent) {
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
    createdAt: new Date(conversation.created_at),
    updatedAt: new Date(conversation.updated_at),
  });

  const conversationUrl = `https://app.intercom.com/a/apps/${intercomWorkspace.intercomWorkspaceId}/inbox/inbox/${conversation.id}`;

  await upsertToDatasource({
    dataSourceConfig,
    documentId: getConversationInternalId(connectorId, conversation.id),
    documentContent: renderedPage,
    documentUrl: conversationUrl,
    timestampMs: conversation.updated_at,
    tags: [
      `title:${conversation.title}`,
      `createdAt:${conversation.created_at}`,
      `updatedAt:${conversation.updated_at}`,
    ],
    parents: [getTeamInternalId(connectorId, teamId)],
    retries: 3,
    delayBetweenRetriesMs: 500,
    loggerArgs: {
      ...loggerArgs,
      conversationId: conversation.id,
    },
    upsertContext: {
      sync_type: "batch",
    },
  });
}
