import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getUniqueCustomFieldIds,
  getZendeskClient,
  ZendeskApiError,
} from "@app/lib/api/actions/servers/zendesk/client";
import { ZENDESK_TOOLS_METADATA } from "@app/lib/api/actions/servers/zendesk/metadata";
import {
  renderTicket,
  renderTicketComments,
  renderTicketFields,
  renderTicketMetrics,
} from "@app/lib/api/actions/servers/zendesk/rendering";
import type {
  ZendeskTicketComment,
  ZendeskUser,
} from "@app/lib/api/actions/servers/zendesk/types";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { isSupportedFileContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const ZENDESK_TAG_MAX_LENGTH = 255;
const ZENDESK_TAG_REGEX = /^[a-z0-9_\-/]+$/;

function isTrackedError(error: Error): boolean {
  return !(error instanceof ZendeskApiError && error.isInvalidInput);
}

const handlers: ToolHandlers<typeof ZENDESK_TOOLS_METADATA> = {
  get_ticket: async (
    { ticketId, includeMetrics, includeConversation, includeAttachments },
    { authInfo, auth }
  ) => {
    const clientResult = getZendeskClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const ticketResult = await client.getTicket(ticketId);

    if (ticketResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to retrieve ticket: ${ticketResult.error.message}`,
          { tracked: isTrackedError(ticketResult.error) }
        )
      );
    }

    const ticket = ticketResult.value;

    const fieldIds = getUniqueCustomFieldIds(ticket);
    const ticketFieldsResult = await client.getTicketFieldsByIds(fieldIds);

    let ticketText = renderTicket(ticket, ticketFieldsResult);

    if (includeMetrics) {
      const metricsResult = await client.getTicketMetrics(ticketId);

      if (metricsResult.isErr()) {
        return new Err(
          new MCPError(
            `Failed to retrieve ticket metrics: ${metricsResult.error.message}`,
            { tracked: isTrackedError(metricsResult.error) }
          )
        );
      }

      ticketText += "\n" + renderTicketMetrics(metricsResult.value);
    }

    // Fetch comments when conversation or attachments are requested.
    const needComments = includeConversation || includeAttachments;
    let comments: ZendeskTicketComment[] = [];
    let users: ZendeskUser[] = [];

    if (needComments) {
      const commentsResult = await client.getTicketComments(ticketId);

      if (commentsResult.isErr()) {
        return new Err(
          new MCPError(
            `Failed to retrieve ticket conversation: ${commentsResult.error.message}`,
            { tracked: isTrackedError(commentsResult.error) }
          )
        );
      }

      comments = commentsResult.value;
      const authorIds = Array.from(
        new Set(comments.map((comment) => comment.author_id))
      );

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
    }

    if (includeConversation) {
      ticketText += renderTicketComments(comments, users);
    }

    const contentBlocks: CallToolResult["content"] = [
      { type: "text" as const, text: ticketText },
    ];

    if (includeAttachments) {
      const allAttachments = comments.flatMap((c) =>
        (c.attachments ?? []).filter((a) => !a.deleted)
      );

      for (const attachment of allAttachments) {
        const contentType = attachment.content_type;

        if (!isSupportedFileContentType(contentType)) {
          contentBlocks.push({
            type: "text" as const,
            text: `\n--- Attachment: ${attachment.file_name} ---\nUnsupported file type (${contentType}), skipped.`,
          });
          continue;
        }

        const fetchResult = await client.fetchAttachment(
          attachment.content_url
        );
        if (fetchResult.isErr()) {
          logger.error(
            {
              attachmentId: attachment.id,
              filename: attachment.file_name,
              error: fetchResult.error.message,
            },
            "[Zendesk] Failed to fetch attachment"
          );
          continue;
        }
        const { body, contentLength } = fetchResult.value;

        const file = await FileResource.makeNew({
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: auth.user()?.id ?? null,
          contentType,
          fileName: attachment.file_name,
          fileSize: contentLength ?? attachment.size,
          useCase: "conversation",
          useCaseMetadata: {},
        });

        const processResult = await processAndStoreFile(auth, {
          file,
          content: {
            type: "readable",
            value: body,
          },
        });

        if (processResult.isErr()) {
          logger.error(
            {
              attachmentId: attachment.id,
              filename: attachment.file_name,
              error: processResult.error,
            },
            "[Zendesk] Failed to process attachment"
          );
          continue;
        }

        const storedFile = processResult.value;
        const fileResource = {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          fileId: storedFile.sId,
          contentType,
          title: attachment.file_name,
          text: `Attachment: ${attachment.file_name}`,
          snippet: storedFile.snippet,
          uri: storedFile.getPublicUrl(auth),
        };
        contentBlocks.push({
          type: "resource" as const,
          resource: fileResource,
        });
      }
    }

    return new Ok(contentBlocks);
  },

  search_tickets: async ({ query, sortBy, sortOrder }, { authInfo }) => {
    const clientResult = getZendeskClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.searchTickets(query, sortBy, sortOrder);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to search tickets: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    const { results, count, next_page } = result.value;

    if (results.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No tickets found matching the search criteria.",
        },
      ]);
    }

    const fieldIds = getUniqueCustomFieldIds(results);
    const ticketFieldsResult = await client.getTicketFieldsByIds(fieldIds);

    const ticketsText = results
      .map((ticket) => {
        return ["---", renderTicket(ticket, ticketFieldsResult)].join("\n");
      })
      .join("\n\n");

    const paginationInfo = next_page
      ? "\n\nNote: There are more tickets available."
      : "";

    return new Ok([
      {
        type: "text" as const,
        text: `Found ${count} ticket(s):\n\n${ticketsText}${paginationInfo}`,
      },
    ]);
  },

  list_ticket_fields: async ({ includeInactive }, { authInfo }) => {
    const clientResult = getZendeskClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.listAllTicketFields({ includeInactive });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to list ticket fields: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    const fields = result.value;

    return new Ok([
      {
        type: "text" as const,
        text: renderTicketFields(fields),
      },
    ]);
  },

  draft_reply: async ({ ticketId, body }, { authInfo }) => {
    const clientResult = getZendeskClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.draftReply(ticketId, body);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to draft reply: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Draft reply successfully added to ticket ${ticketId}. The comment is private and not visible to the end user.`,
      },
    ]);
  },

  post_reply: async ({ ticketId, body }, { authInfo }) => {
    const clientResult = getZendeskClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.postReply(ticketId, body);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to post reply: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Public reply successfully posted to ticket ${ticketId}. The comment is visible to the end user.`,
      },
    ]);
  },

  update_ticket_tags: async ({ ticketId, tags, override }, { authInfo }) => {
    const clientResult = getZendeskClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const invalidTags = tags.filter(
      (tag) =>
        tag.length > ZENDESK_TAG_MAX_LENGTH || !ZENDESK_TAG_REGEX.test(tag)
    );
    if (invalidTags.length > 0) {
      return new Err(
        new MCPError(
          `Invalid tag(s): ${invalidTags.join(", ")}. Tags must be lowercase, max 255 characters, no spaces; only letters, digits, _, -, / are allowed.`,
          { tracked: false }
        )
      );
    }

    const result = override
      ? await client.setTicketTags(ticketId, tags)
      : await client.addTicketTags(ticketId, tags);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to update ticket tags: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    const action = override ? "replaced (override)" : "added";
    const currentTags = result.value.join(", ") || "(none)";
    return new Ok([
      {
        type: "text" as const,
        text: `Tags successfully ${action} on ticket ${ticketId}. Current tags: ${currentTags}`,
      },
    ]);
  },
};

export const TOOLS = buildTools(ZENDESK_TOOLS_METADATA, handlers);
