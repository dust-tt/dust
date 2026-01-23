import {
  getUniqueCustomFieldIds,
  getZendeskClient,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/client";
import {
  renderTicket,
  renderTicketComments,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/rendering";
import type { ZendeskUser } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";

function apiUrlToDocumentUrl(apiUrl: string): string {
  return apiUrl.replace("/api/v2", "").replace(".json", "");
}

export async function search({
  accessToken,
  query,
  pageSize,
  metadata,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  const clientResult = getZendeskClient({
    token: accessToken,
    clientId: "",
    scopes: [],
    extra: {
      zendesk_subdomain: metadata?.zendesk_subdomain,
    },
  });

  if (clientResult.isErr()) {
    return [];
  }

  const client = clientResult.value;

  // Check if the query is a ticket ID (e.g., "#68" or "68")
  const ticketIdMatch = query.match(/^#?(\d+)$/);

  if (ticketIdMatch) {
    // Direct ticket ID lookup
    const ticketId = parseInt(ticketIdMatch[1], 10);
    const ticketResult = await client.getTicket(ticketId);

    if (ticketResult.isErr()) {
      return [];
    }

    const ticket = ticketResult.value;
    return [
      {
        externalId: ticket.id.toString(),
        title: ticket.subject ?? "No subject",
        mimeType: "application/vnd.zendesk.ticket",
        type: "document" as const,
        sourceUrl: apiUrlToDocumentUrl(ticket.url),
      },
    ];
  }

  // Zendesk search syntax: subject:query searches in the ticket subject/title
  const formattedQuery = `subject:${query}`;
  const result = await client.searchTickets(formattedQuery);

  if (result.isErr()) {
    return [];
  }

  const { results } = result.value;

  const limitedResults = results.slice(0, pageSize);

  return limitedResults.map((ticket) => ({
    externalId: ticket.id.toString(),
    title: ticket.subject ?? "No subject",
    mimeType: "application/vnd.zendesk.ticket",
    type: "document" as const,
    sourceUrl: apiUrlToDocumentUrl(ticket.url),
  }));
}

export async function download({
  accessToken,
  externalId,
  metadata,
}: ToolDownloadParams): Promise<ToolDownloadResult> {
  const clientResult = getZendeskClient({
    token: accessToken,
    clientId: "",
    scopes: [],
    extra: {
      zendesk_subdomain: metadata?.zendesk_subdomain,
    },
  });

  if (clientResult.isErr()) {
    throw new Error(clientResult.error.message);
  }

  const client = clientResult.value;
  const ticketId = parseInt(externalId, 10);

  if (isNaN(ticketId)) {
    throw new Error(`Invalid ticket ID: ${externalId}`);
  }

  const ticketResult = await client.getTicket(ticketId);
  if (ticketResult.isErr()) {
    throw new Error(ticketResult.error.message);
  }

  const ticket = ticketResult.value;

  const fieldIds = getUniqueCustomFieldIds(ticket);
  const ticketFieldsResult = await client.getTicketFieldsByIds(fieldIds);

  let content = renderTicket(ticket, ticketFieldsResult);

  // Fetch and add comments
  const commentsResult = await client.getTicketComments(ticketId);
  if (commentsResult.isOk()) {
    const comments = commentsResult.value;
    const authorIds = Array.from(
      new Set(comments.map((comment) => comment.author_id))
    );

    let users: ZendeskUser[] = [];
    if (authorIds.length > 0) {
      const usersResult = await client.getUsersByIds(authorIds);
      if (usersResult.isErr()) {
        logger.warn(
          {
            error: usersResult.error.message,
          },
          "[Zendesk] Failed to retrieve user information for comments"
        );
      } else {
        users = usersResult.value;
      }
    }

    content += renderTicketComments(comments, users);
  } else {
    logger.warn(
      {
        ticketId,
        error: commentsResult.error.message,
      },
      "[Zendesk] Failed to retrieve ticket comments"
    );
  }

  return {
    content,
    fileName: `zendesk-ticket-${ticketId}`,
    contentType: "text/markdown",
  };
}
