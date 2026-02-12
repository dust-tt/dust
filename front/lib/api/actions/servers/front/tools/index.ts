import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  convertMarkdownToHTML,
  findChannelAddress,
  formatConversationForLLM,
  formatMessagesForLLM,
  getFrontAPITokenFromExtra,
  makeFrontAPIRequest,
} from "@app/lib/api/actions/servers/front/helpers";
import { FRONT_TOOLS_METADATA } from "@app/lib/api/actions/servers/front/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface FrontListResponse {
  _results?: unknown[];
}

interface FrontTag {
  id: string;
  name: string;
  description?: string;
}

interface FrontTeammate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_available: boolean;
}

interface FrontInbox {
  id: string;
  name: string;
  is_private: boolean;
}

const handlers: ToolHandlers<typeof FRONT_TOOLS_METADATA> = {
  search_conversations: async ({ q, limit = 20 }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = (await makeFrontAPIRequest({
        method: "GET",
        endpoint: "conversations",
        apiToken,
        params: { q, limit: Math.min(limit, 100) },
      })) as FrontListResponse;

      const conversations = data._results ?? [];

      if (conversations.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: `No conversations found for query: "${q}"`,
          },
        ]);
      }

      const formatted = conversations
        .map((conv) =>
          formatConversationForLLM(
            conv as Parameters<typeof formatConversationForLLM>[0]
          )
        )
        .join("\n\n");

      return new Ok([
        {
          type: "text" as const,
          text:
            `Found ${conversations.length} conversation(s)` +
            "\n\n" +
            formatted,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to search conversations: ${normalizeError(error).message}`
        )
      );
    }
  },

  get_conversation: async ({ conversation_id }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = await makeFrontAPIRequest({
        method: "GET",
        endpoint: `conversations/${conversation_id}`,
        apiToken,
      });

      const formatted = formatConversationForLLM(
        data as Parameters<typeof formatConversationForLLM>[0]
      );

      return new Ok([
        {
          type: "text" as const,
          text:
            `Retrieved conversation ${conversation_id}` + "\n\n" + formatted,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to get conversation: ${normalizeError(error).message}`
        )
      );
    }
  },

  get_conversation_messages: async ({ conversation_id }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = (await makeFrontAPIRequest({
        method: "GET",
        endpoint: `conversations/${conversation_id}/messages`,
        apiToken,
      })) as FrontListResponse;

      const messages = data._results ?? [];
      const formatted = formatMessagesForLLM(
        messages as Parameters<typeof formatMessagesForLLM>[0]
      );

      return new Ok([
        {
          type: "text" as const,
          text:
            `Retrieved ${messages.length} message(s) from conversation ${conversation_id}` +
            "\n\n" +
            formatted,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to get conversation messages: ${normalizeError(error).message}`
        )
      );
    }
  },

  get_contact: async ({ email, contact_id }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      let data;
      if (contact_id) {
        data = await makeFrontAPIRequest({
          method: "GET",
          endpoint: `contacts/${contact_id}`,
          apiToken,
        });
      } else if (email) {
        const searchData = (await makeFrontAPIRequest({
          method: "GET",
          endpoint: "contacts",
          apiToken,
          params: { q: email },
        })) as FrontListResponse;
        const contacts = searchData._results ?? [];
        if (contacts.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No contact found with email: ${email}`,
            },
          ]);
        }
        data = contacts[0];
      } else {
        throw new MCPError("Either email or contact_id must be provided");
      }

      return new Ok([
        {
          type: "text" as const,
          text:
            `Retrieved contact information` +
            "\n\n" +
            JSON.stringify(data, null, 2),
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to get contact: ${normalizeError(error).message}`)
      );
    }
  },

  list_tags: async (_params, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = (await makeFrontAPIRequest({
        method: "GET",
        endpoint: "tags",
        apiToken,
      })) as FrontListResponse;

      const tags = (data._results ?? []) as FrontTag[];
      const formatted = tags
        .map(
          (tag) =>
            `- ${tag.name} (ID: ${tag.id})${tag.description ? ` - ${tag.description}` : ""}`
        )
        .join("\n");

      return new Ok([
        {
          type: "text" as const,
          text: `Found ${tags.length} tag(s)` + "\n\n" + formatted,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to list tags: ${normalizeError(error).message}`)
      );
    }
  },

  list_teammates: async (_params, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = (await makeFrontAPIRequest({
        method: "GET",
        endpoint: "teammates",
        apiToken,
      })) as FrontListResponse;

      const teammates = (data._results ?? []) as FrontTeammate[];
      const formatted = teammates
        .map(
          (tm) =>
            `- ${tm.first_name} ${tm.last_name} (${tm.email}) - ID: ${tm.id}${tm.is_available ? "" : " [Away]"}`
        )
        .join("\n");

      return new Ok([
        {
          type: "text" as const,
          text: `Found ${teammates.length} teammate(s)` + "\n\n" + formatted,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to list teammates: ${normalizeError(error).message}`
        )
      );
    }
  },

  get_customer_history: async ({ customer_email, limit = 10 }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = (await makeFrontAPIRequest({
        method: "GET",
        endpoint: "conversations",
        apiToken,
        params: {
          q: `from:${customer_email}`,
          limit: Math.min(limit, 100),
        },
      })) as FrontListResponse;

      const conversations = data._results ?? [];

      if (conversations.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: `No past conversations found for customer: ${customer_email}`,
          },
        ]);
      }

      const formatted = conversations
        .map((conv) =>
          formatConversationForLLM(
            conv as Parameters<typeof formatConversationForLLM>[0]
          )
        )
        .join("\n\n");

      return new Ok([
        {
          type: "text" as const,
          text:
            `Found ${conversations.length} past conversation(s) with ${customer_email}` +
            "\n\n" +
            formatted,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to get customer history: ${normalizeError(error).message}`
        )
      );
    }
  },

  list_inboxes: async (_params, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = (await makeFrontAPIRequest({
        method: "GET",
        endpoint: "inboxes",
        apiToken,
      })) as FrontListResponse;

      const inboxes = (data._results ?? []) as FrontInbox[];
      const formatted = inboxes
        .map(
          (inbox) =>
            `- ${inbox.name} (ID: ${inbox.id})${inbox.is_private ? " [Private]" : ""}`
        )
        .join("\n");

      return new Ok([
        {
          type: "text" as const,
          text: `Found ${inboxes.length} inbox(es)` + "\n\n" + formatted,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to list inboxes: ${normalizeError(error).message}`)
      );
    }
  },

  create_conversation: async (
    { inbox_id, to, subject, body, author_id },
    extra
  ) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const data = await makeFrontAPIRequest({
        method: "POST",
        endpoint: `inboxes/${inbox_id}/messages`,
        apiToken,
        body: {
          to,
          subject,
          body,
          ...(author_id && { author_id }),
        },
      });

      return new Ok([
        {
          type: "text" as const,
          text:
            `Outbound conversation created successfully` +
            "\n\n" +
            JSON.stringify(data, null, 2),
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to create conversation: ${normalizeError(error).message}`
        )
      );
    }
  },

  create_draft: async ({ conversation_id, body, author_id }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const conversation = await makeFrontAPIRequest({
        method: "GET",
        endpoint: `conversations/${conversation_id}`,
        apiToken,
      });

      const messagesData = (await makeFrontAPIRequest({
        method: "GET",
        endpoint: `conversations/${conversation_id}/messages`,
        apiToken,
      })) as FrontListResponse;

      const channelAddress = await findChannelAddress(
        apiToken,
        conversation_id,
        conversation as Parameters<typeof findChannelAddress>[2],
        messagesData as Parameters<typeof findChannelAddress>[3]
      );

      if (!channelAddress) {
        return new Err(
          new MCPError(
            "Unable to determine channel address from conversation. The conversation may not have sufficient message history or inbox configuration."
          )
        );
      }

      const channel_id = `alt:address:${channelAddress}`;
      const htmlBody = await convertMarkdownToHTML(body);

      await makeFrontAPIRequest({
        method: "POST",
        endpoint: `conversations/${conversation_id}/drafts`,
        apiToken,
        body: {
          body: htmlBody,
          mode: "shared",
          channel_id,
          ...(author_id && { author_id }),
        },
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Draft created for conversation ${conversation_id}`,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to create draft: ${normalizeError(error).message}`)
      );
    }
  },

  add_tags: async ({ conversation_id, tag_ids }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      await makeFrontAPIRequest({
        method: "POST",
        endpoint: `conversations/${conversation_id}/tags`,
        apiToken,
        body: { tag_ids },
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Added ${tag_ids.length} tag(s) to conversation ${conversation_id}`,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to add tags: ${normalizeError(error).message}`)
      );
    }
  },

  add_comment: async ({ conversation_id, body, author_id }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      await makeFrontAPIRequest({
        method: "POST",
        endpoint: `conversations/${conversation_id}/comments`,
        apiToken,
        body: {
          body,
          ...(author_id && { author_id }),
        },
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Internal comment added to conversation ${conversation_id}`,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to add comment: ${normalizeError(error).message}`)
      );
    }
  },

  add_links: async ({ conversation_id, linked_conversation_ids }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      await makeFrontAPIRequest({
        method: "POST",
        endpoint: `conversations/${conversation_id}/links`,
        apiToken,
        body: { conversation_ids: linked_conversation_ids },
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Linked ${linked_conversation_ids.length} conversation(s) to ${conversation_id}`,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to add links: ${normalizeError(error).message}`)
      );
    }
  },

  send_message: async (
    { conversation_id, body, type = "reply", author_id },
    extra
  ) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      const endpoint =
        type === "comment"
          ? `conversations/${conversation_id}/comments`
          : `conversations/${conversation_id}/messages`;

      const htmlBody = await convertMarkdownToHTML(body);

      const requestBody: Record<string, unknown> = {
        body: htmlBody,
        ...(author_id && { author_id }),
      };

      if (type === "comment") {
        requestBody.type = "comment";
      }

      await makeFrontAPIRequest({
        method: "POST",
        endpoint,
        apiToken,
        body: requestBody,
      });

      return new Ok([
        {
          type: "text" as const,
          text: `${type === "comment" ? "Internal comment" : "Reply"} sent successfully to conversation ${conversation_id}`,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(`Failed to send message: ${normalizeError(error).message}`)
      );
    }
  },

  update_conversation_status: async ({ conversation_id, status }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      await makeFrontAPIRequest({
        method: "PATCH",
        endpoint: `conversations/${conversation_id}`,
        apiToken,
        body: { status },
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Updated conversation ${conversation_id} status to: ${status}`,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to update conversation status: ${normalizeError(error).message}`
        )
      );
    }
  },

  assign_conversation: async ({ conversation_id, teammate_id }, extra) => {
    try {
      const apiToken = await getFrontAPITokenFromExtra(extra);

      await makeFrontAPIRequest({
        method: "PUT",
        endpoint: `conversations/${conversation_id}/assignee`,
        apiToken,
        body: { assignee_id: teammate_id },
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Assigned conversation ${conversation_id} to teammate ${teammate_id}`,
        },
      ]);
    } catch (error) {
      if (error instanceof MCPError) {
        return new Err(error);
      }
      return new Err(
        new MCPError(
          `Failed to assign conversation: ${normalizeError(error).message}`
        )
      );
    }
  },
};

export const TOOLS = buildTools(FRONT_TOOLS_METADATA, handlers);
