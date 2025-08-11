import TurndownService from "turndown";

import { filterCustomTags } from "@connectors/connectors/shared/tags";
import { getTicketInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import type {
  ZendeskFetchedTicket,
  ZendeskFetchedTicketComment,
  ZendeskFetchedUser,
} from "@connectors/connectors/zendesk/lib/types";
import {
  deleteDataSourceDocument,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ZendeskConfigurationResource } from "@connectors/resources/zendesk_resources";
import { ZendeskTicketResource } from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { stripNullBytes } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

const turndownService = new TurndownService();

function apiUrlToDocumentUrl(apiUrl: string): string {
  return apiUrl.replace("/api/v2/", "/").replace(".json", "");
}

export function shouldSyncTicket(
  ticket: ZendeskFetchedTicket,
  configuration: ZendeskConfigurationResource,
  {
    brandId,
    organizationTags = [],
    ticketTags = [],
  }: { brandId?: number; organizationTags?: string[]; ticketTags?: string[] }
): { shouldSync: false; reason: string } | { shouldSync: true; reason: null } {
  if (ticket.status === "deleted") {
    return { shouldSync: false, reason: "Ticket is deleted." };
  }
  if (
    !configuration.syncUnresolvedTickets &&
    !["closed", "solved"].includes(ticket.status)
  ) {
    return {
      shouldSync: false,
      reason: `Ticket is not resolved, status: ${ticket.status}.`,
    };
  }
  if (brandId && brandId !== ticket.brand_id) {
    return {
      shouldSync: false,
      reason: `Ticket does not belong to the brand, ticket brand: ${ticket.brand_id}, expected: ${brandId}.`,
    };
  }

  // If we enforce an inclusion rule on organization tags, all tickets must have at least one of the
  // mandatory tags.
  if (
    configuration.organizationTagsToInclude &&
    configuration.organizationTagsToInclude.length > 0 &&
    !configuration.organizationTagsToInclude.some((mandatoryTag) =>
      organizationTags.includes(mandatoryTag)
    )
  ) {
    return {
      shouldSync: false,
      reason: "Ticket does not match any of the required organization tags.",
    };
  }

  // If we enforce an exclusion rule on organization tags, we must not have any of the
  // excluded tags.
  if (
    configuration.organizationTagsToExclude &&
    configuration.organizationTagsToExclude.length > 0 &&
    configuration.organizationTagsToExclude.some((prohibitedTag) =>
      organizationTags.includes(prohibitedTag)
    )
  ) {
    return {
      shouldSync: false,
      reason: "Ticket contains prohibited organization tags.",
    };
  }

  // If we enforce an inclusion rule on ticket tags, we must have at least one of the
  // mandatory tags.
  if (
    configuration.ticketTagsToInclude &&
    configuration.ticketTagsToInclude.length > 0 &&
    !configuration.ticketTagsToInclude.some((mandatoryTag) =>
      ticketTags.includes(mandatoryTag)
    )
  ) {
    return {
      shouldSync: false,
      reason: "Ticket does not match any of the required tags.",
    };
  }

  // If we enforce an exclusion rule on ticket tags, we must not have any of the
  // excluded tags.
  if (
    configuration.ticketTagsToExclude &&
    configuration.ticketTagsToExclude.length > 0 &&
    configuration.ticketTagsToExclude.some((prohibitedTag) =>
      ticketTags.includes(prohibitedTag)
    )
  ) {
    return { shouldSync: false, reason: "Ticket contains prohibited tags." };
  }

  // All checks passed.
  return { shouldSync: true, reason: null };
}

export function extractMetadataFromDocumentUrl(ticketUrl: string): {
  brandSubdomain: string;
  ticketId: number;
} {
  // Format: https://${subdomain}.zendesk.com/tickets/${ticketId}.
  const match = ticketUrl.match(
    /^https:\/\/([^.]+)\.zendesk\.com\/(?:agent\/)?tickets\/#?(\d+)/
  );
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid ticket URL: ${ticketUrl}`);
  }
  return {
    brandSubdomain: match[1],
    ticketId: parseInt(match[2], 10),
  };
}

/**
 * Deletes a ticket from the db and the data sources.
 */
export async function deleteTicket({
  connectorId,
  brandId,
  ticketId,
  dataSourceConfig,
  loggerArgs,
}: {
  connectorId: ModelId;
  brandId: number;
  ticketId: number;
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number | null>;
}): Promise<void> {
  logger.info(
    { ...loggerArgs, connectorId, ticketId },
    "[Zendesk] Deleting ticket."
  );
  await deleteDataSourceDocument(
    dataSourceConfig,
    getTicketInternalId({ connectorId, brandId, ticketId })
  );
  await ZendeskTicketResource.deleteByTicketId({
    connectorId,
    brandId,
    ticketId,
  });
}

/**
 * Syncs a ticket in the db and upserts it to the data sources.
 */
export async function syncTicket({
  ticket,
  connector,
  configuration,
  brandId,
  currentSyncDateMs,
  dataSourceConfig,
  loggerArgs,
  forceResync,
  comments,
  users,
}: {
  ticket: ZendeskFetchedTicket;
  connector: ConnectorResource;
  configuration: ZendeskConfigurationResource;
  dataSourceConfig: DataSourceConfig;
  brandId: number;
  currentSyncDateMs: number;
  loggerArgs: Record<string, string | number | null>;
  forceResync: boolean;
  comments: ZendeskFetchedTicketComment[];
  users: ZendeskFetchedUser[];
}) {
  const connectorId = connector.id;

  if (ticket.brand_id !== brandId) {
    logger.info(
      {
        ...loggerArgs,
        connectorId,
        ticketId: ticket.id,
        ticketBrandId: ticket.brand_id,
        brandId,
      },
      "[Zendesk] Skipping sync. Ticket does not belong to the correct brand."
    );
    return;
  }

  let ticketInDb = await ZendeskTicketResource.fetchByTicketId({
    connectorId,
    brandId,
    ticketId: ticket.id,
  });

  const createdAtDate = new Date(ticket.created_at);
  const updatedAtDate = new Date(ticket.updated_at);

  const shouldPerformUpsertion =
    forceResync ||
    !ticketInDb ||
    !ticketInDb.lastUpsertedTs ||
    ticketInDb.lastUpsertedTs < updatedAtDate;

  // Tickets can be created without a subject using the API or by email,
  // if they were never attended in the Agent Workspace, their subject is not populated.
  const ticketSubject = stripNullBytes(ticket.subject?.trim() || "No subject");
  const ticketUrl = apiUrlToDocumentUrl(ticket.url);
  if (!ticketInDb) {
    ticketInDb = await ZendeskTicketResource.makeNew({
      blob: {
        subject: ticketSubject,
        url: ticketUrl,
        lastUpsertedTs: new Date(currentSyncDateMs),
        ticketUpdatedAt: updatedAtDate,
        ticketId: ticket.id,
        brandId,
        permission: "read",
        connectorId,
      },
    });
  } else {
    await ticketInDb.update({
      subject: ticketSubject,
      url: ticketUrl,
      lastUpsertedTs: new Date(currentSyncDateMs),
      ticketUpdatedAt: updatedAtDate,
      permission: "read",
    });
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

    const ticketContent = `Conversation:\n${comments
      .map((comment) => {
        // Remove line and paragraph separators.
        const commentContent = (comment.plain_body || comment.body).replace(
          /[\u2028\u2029]/g,
          ""
        );
        if (configuration.hideCustomerDetails) {
          return `[${comment?.created_at}] User ${comment.author_id}:\n${commentContent}`;
        }
        const author =
          users.find((user) => user.id === comment.author_id) ?? null;
        return `[${comment?.created_at}] ${author ? `${author.name} (${author.email})` : "Unknown User"}:\n${commentContent}`;
      })
      .join("\n")}`.trim();

    const ticketContentInMarkdown = turndownService.turndown(ticketContent);

    const renderedMarkdown = await renderMarkdownSection(
      dataSourceConfig,
      ticketContentInMarkdown
    );

    const metadata = [
      `ticketId:${ticket.id}`,
      `priority:${ticket.priority}`,
      `ticketType:${ticket.type}`,
      `channel:${ticket.via?.channel}`,
      `status:${ticket.status}`,
      ...(ticket.group_id ? [`groupId:${ticket.group_id}`] : []),
      ...(ticket.organization_id
        ? [`organizationId:${ticket.organization_id}`]
        : []),
      ...(ticket.due_at
        ? [`dueDate:${new Date(ticket.due_at).toISOString()}`]
        : []),
      ...(ticket.satisfaction_rating.score !== "unoffered" // Special value when no rating was provided.
        ? [`satisfactionRating:${ticket.satisfaction_rating.score}`]
        : []),
      `hasIncidents:${ticket.has_incidents ? "Yes" : "No"}`,
    ];

    // Process custom field tags.
    const customFieldTags: string[] = [];
    if (configuration.customFieldsConfig && ticket.custom_fields) {
      for (const customField of ticket.custom_fields) {
        // The ticket contains the ID of the custom field and a value for it.
        // e.g. `{ "id": 1, "value": "yes"}`, we stored the id and the title
        // of the custom field.
        const configuredField = configuration.customFieldsConfig.find(
          (field) => field.id === customField.id
        );
        // Case where we did choose to sync this custom field.
        if (configuredField && customField.value) {
          customFieldTags.push(`${configuredField.name}:${customField.value}`);
        }
      }
    }

    const documentContent = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: ticketSubject,
      content: renderedMarkdown,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
      additionalPrefixes: {
        metadata: metadata
          // We remove IDs from the prefixes since they do not hold any semantic meaning.
          .filter(
            (field) =>
              !["ticketId", "organizationId", "groupId"].includes(field)
          )
          .join(", "),
        labels: ticket.tags.join(", ") || "none",
      },
    });

    const documentId = getTicketInternalId({
      connectorId,
      brandId,
      ticketId: ticket.id,
    });

    const parents = ticketInDb.getParentInternalIds(connectorId);
    await upsertDataSourceDocument({
      dataSourceConfig,
      documentId,
      documentContent,
      documentUrl: ticketUrl,
      timestampMs: updatedAtDate.getTime(),
      tags: [
        `updatedAt:${updatedAtDate.getTime()}`,
        `createdAt:${createdAtDate.getTime()}`,
        ...metadata,
        ...filterCustomTags(ticket.tags, logger),
        ...customFieldTags,
      ],
      parents,
      parentId: parents[1],
      loggerArgs: { ...loggerArgs, ticketId: ticket.id },
      upsertContext: { sync_type: "batch" },
      title: `#${ticket.id}: ${ticketSubject}`,
      mimeType: INTERNAL_MIME_TYPES.ZENDESK.TICKET,
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
