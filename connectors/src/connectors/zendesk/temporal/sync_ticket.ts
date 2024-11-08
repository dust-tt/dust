import type { ModelId } from "@dust-tt/types";
import TurndownService from "turndown";

import { getTicketInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import type {
  ZendeskFetchedTicket,
  ZendeskFetchedTicketComment,
  ZendeskFetchedUser,
} from "@connectors/connectors/zendesk/lib/node-zendesk-types";
import {
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import { ZendeskTicketResource } from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const turndownService = new TurndownService();

export async function syncTicket({
  connectorId,
  ticket,
  brandId,
  currentSyncDateMs,
  dataSourceConfig,
  loggerArgs,
  forceResync,
  comments,
  users,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  ticket: ZendeskFetchedTicket;
  brandId: number;
  currentSyncDateMs: number;
  loggerArgs: Record<string, string | number | null>;
  forceResync: boolean;
  comments: ZendeskFetchedTicketComment[];
  users: ZendeskFetchedUser[];
}) {
  let ticketInDb = await ZendeskTicketResource.fetchByTicketId({
    connectorId,
    ticketId: ticket.id,
  });

  const createdAtDate = new Date(ticket.created_at);
  const updatedAtDate = new Date(ticket.updated_at);

  const shouldPerformUpsertion =
    forceResync ||
    !ticketInDb ||
    !ticketInDb.lastUpsertedTs ||
    ticketInDb.lastUpsertedTs < updatedAtDate;

  const commonTicketData = {
    subject: ticket.subject,
    url: ticket.url,
    createdAt: createdAtDate,
    updatedAt: updatedAtDate,
    assigneeId: ticket.assignee_id,
    groupId: ticket.group_id,
    organizationId: ticket.organization_id,
    lastUpsertedTs: new Date(currentSyncDateMs),
  };

  if (!ticketInDb) {
    ticketInDb = await ZendeskTicketResource.makeNew({
      blob: {
        ...commonTicketData,
        ticketId: ticket.id,
        brandId,
        permission: "read",
        connectorId,
      },
    });
  } else {
    await ticketInDb.update(commonTicketData);
  }

  if (!shouldPerformUpsertion) {
    logger.info(
      {
        ...loggerArgs,
        connectorId,
        ticketId: ticket.id,
        ticketUpdatedAt: updatedAtDate,
        dataSourceLastUpsertedAt: ticketInDb?.lastUpsertedTs ?? null,
      },
      "[Zendesk] Ticket already up to date. Skipping sync."
    );
    return;
  }

  if (comments.length > 0) {
    logger.info(
      {
        ...loggerArgs,
        connectorId,
        ticketId: ticket.id,
        ticketUpdatedAt: updatedAtDate,
        dataSourceLastUpsertedAt: ticketInDb?.lastUpsertedTs ?? null,
      },
      "[Zendesk] Upserting ticket."
    );

    const metadata = [
      `Ticket ID: ${ticket.id}`,
      `Subject: ${ticket.subject}`,
      `Created At: ${createdAtDate.toISOString()}`,
      `Updated At: ${updatedAtDate.toISOString()}`,
      `Status: ${ticket.status}`,
      ticket.priority ? `Priority: ${ticket.priority}` : null,
      ticket.type ? `Type: ${ticket.type}` : null,
      ticket.via ? `Channel: ${ticket.via.channel}` : null,
      ticket.requester
        ? `Requester: ${ticket.requester.name} (${ticket.requester.email})`
        : null,
      ticket.assignee_id ? `Assignee ID: ${ticket.assignee_id}` : "Unassigned",
      `Organization ID: ${ticket.organization_id || "N/A"}`,
      `Group ID: ${ticket.group_id || "N/A"}`,
      `Tags: ${ticket.tags.length ? ticket.tags.join(", ") : "No tags"}`,
      ticket.due_at
        ? `Due Date: ${new Date(ticket.due_at).toISOString()}`
        : null,
      ticket.satisfaction_rating
        ? `Satisfaction Rating: ${ticket.satisfaction_rating.score}`
        : null,
      ticket.satisfaction_rating?.comment
        ? `Satisfaction Comment: ${ticket.satisfaction_rating.comment}`
        : null,
      `Has Incidents: ${ticket.has_incidents ? "Yes" : "No"}`,
      ticket.problem_id ? `Related Problem ID: ${ticket.problem_id}` : null,
      `Custom Fields:`,
      ...ticket.custom_fields.map(
        (field) => `  - Field ${field.id}: ${field.value || "N/A"}`
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const ticketContent = `
${metadata}

Conversation:
${comments
  .map((comment) => {
    const author = users.find((user) => user.id === comment.author_id);
    return `
[${new Date(comment.created_at).toISOString()}] ${
      author ? `${author.name} (${author.email})` : "Unknown User"
    }:
${comment.body}`;
  })
  .join("\n")}
`.trim();

    const ticketContentInMarkdown = turndownService.turndown(ticketContent);

    const renderedMarkdown = await renderMarkdownSection(
      dataSourceConfig,
      ticketContentInMarkdown
    );
    const documentContent = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: ticket.subject,
      content: renderedMarkdown,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    });

    const documentId = getTicketInternalId(connectorId, ticket.id);

    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentContent,
      documentUrl: ticket.url,
      timestampMs: updatedAtDate.getTime(),
      tags: [
        ...ticket.tags,
        `title:${ticket.subject}`,
        `updatedAt:${updatedAtDate.getTime()}`,
        `createdAt:${createdAtDate.getTime()}`,
      ],
      parents: ticketInDb.getParentInternalIds(connectorId),
      loggerArgs: { ...loggerArgs, ticketId: ticket.id },
      upsertContext: { sync_type: "batch" },
      async: true,
    });
    await ticketInDb.update({ lastUpsertedTs: new Date(currentSyncDateMs) });
  } else {
    logger.warn(
      { ...loggerArgs, connectorId, ticketId: ticket.id },
      "[Zendesk] Ticket has no content or comments. Skipping sync."
    );
  }
}
