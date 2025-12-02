import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import logger from "@app/logger/logger";
import { decrypt, Err, normalizeError, Ok } from "@app/types";

const FRONT_API_BASE_URL = "https://api2.frontapp.com";

// Retry configuration for exponential backoff
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

const convertMarkdownToHTML = async (text: string): Promise<string> => {
  marked.setOptions({
    breaks: true, // Convert single newlines to <br>
    gfm: true, // GitHub Flavored Markdown
  });

  const html = await marked.parse(text);

  // Sanitize HTML to prevent XSS attacks
  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  });

  // Front may expect specific formatting, so we ensure links open in new tabs
  return sanitized.replace(
    /<a href="(.*?)">/g,
    '<a href="$1" target="_blank">'
  );
};

interface FrontAPIOptions {
  method: string;
  endpoint: string;
  apiToken: string;
  body?: any;
  params?: Record<string, any>;
}

/**
 * Makes an API request to Front with retry logic and exponential backoff
 */
const makeFrontAPIRequest = async (
  options: FrontAPIOptions,
  retryCount = 0
): Promise<any> => {
  const { method, endpoint, apiToken, body, params } = options;

  const url = new URL(`${FRONT_API_BASE_URL}/${endpoint}`);

  // Add query parameters if they are provided.
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(key, String(v)));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  });

  // Handle rate limiting with exponential backoff retry logic.
  if (response.status === 429 && retryCount < MAX_RETRIES) {
    const retryAfter = response.headers.get("Retry-After");
    const delay = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount),
          MAX_RETRY_DELAY_MS
        );

    await new Promise((resolve) => setTimeout(resolve, delay));
    return makeFrontAPIRequest(options, retryCount + 1);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new MCPError(
        "Invalid Front API token. Please check your API token configuration."
      );
    } else if (response.status === 403) {
      throw new MCPError(
        "Insufficient permissions. Please check your Front API token permissions."
      );
    } else if (response.status === 404) {
      throw new MCPError(`Resource not found: ${endpoint}`);
    } else if (response.status === 429) {
      throw new MCPError(
        "Front API rate limit exceeded after retries. Please try again later."
      );
    }
    throw new MCPError(`Front API error (${response.status}): ${errorBody}`);
  }

  // Handle empty responses such as 204 No Content.
  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return null;
  }

  return response.json();
};

/**
 * Helper to get the API token from workspace secrets
 */
async function getFrontAPIToken(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<string> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    throw new MCPError(
      "Front API token not configured. Please configure a secret containing your Front API token in the agent settings."
    );
  }

  const secret = await DustAppSecret.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const apiToken = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;

  if (!apiToken) {
    throw new MCPError(
      "Front API token not found in workspace secrets. Please check the secret configuration."
    );
  }

  return apiToken;
}

/**
 * Format conversation data in LLM-friendly format
 */
function formatConversationForLLM(conversation: any): string {
  const metadata = `<conversation id="${conversation.id}" status="${conversation.status}">
  SUBJECT: ${conversation.subject ?? "(No subject)"}
  STATUS: ${conversation.status}
  ASSIGNEE: ${conversation.assignee ? conversation.assignee.email : "Unassigned"}
  INBOX: ${conversation.inbox?.name ?? "Unknown"}
  TAGS: ${conversation.tags?.map((t: any) => t.name).join(", ") ?? "None"}
  CREATED: ${conversation.created_at ? new Date(conversation.created_at * 1000).toISOString() : "Unknown"}
  LAST_MESSAGE: ${conversation.last_message?.received_at ? new Date(conversation.last_message.received_at * 1000).toISOString() : "None"}
  RECIPIENT: ${conversation.recipient ? (conversation.recipient.handle ?? conversation.recipient.name) : "Unknown"}
  </conversation>`;

  return metadata;
}

/**
 * Format message timeline in LLM-friendly format
 */
function formatMessagesForLLM(messages: any[]): string {
  if (messages.length === 0) {
    return "No messages found.";
  }

  const timeline = messages
    .sort((a, b) => a.created_at - b.created_at)
    .map((msg, index) => {
      const timestamp = new Date(msg.created_at * 1000).toISOString();
      const type =
        msg.type === "comment"
          ? "COMMENT"
          : msg.is_inbound
            ? "RECEIVED"
            : "SENT";
      const attachmentInfo =
        msg.attachments && msg.attachments.length > 0
          ? `\n  ATTACHMENTS:\n${msg.attachments.map((a: any) => `  - ${a.filename}`).join("\n")}`
          : "";

      return `<entry index="${index + 1}" type="${type}">
  FROM: ${msg.author?.email ?? msg.author?.username ?? "Unknown"}
  TO: ${msg.recipients?.map((r: any) => r.handle ?? r.name).join(", ") ?? "N/A"}
  TIMESTAMP: ${timestamp}
  ${msg.subject ? `SUBJECT: ${msg.subject}\n` : ""}CONTENT:
  ${msg.body ?? msg.text ?? ""}${attachmentInfo}
  </entry>`;
    })
    .join("\n\n");

  const metadata = `<conversation_timeline>
  TOTAL_MESSAGES: ${messages.length}
  TIMELINE_START: ${new Date(messages[0].created_at * 1000).toISOString()}
  TIMELINE_END: ${new Date(messages[messages.length - 1].created_at * 1000).toISOString()}
  </conversation_timeline>\n\n`;

  return metadata + timeline;
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("front");

  server.tool(
    "search_conversations",
    "Search conversations in Front by keywords, customer email, tags, status, or other criteria. " +
      "Returns matching conversations with their details.",
    {
      q: z
        .string()
        .describe(
          "Search query. Can include keywords, email addresses (e.g., 'customer@example.com'), " +
            "status filters (e.g., 'is:open', 'is:archived'), tag filters (e.g., 'tag:bug'), etc."
        ),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe(
          "Maximum number of conversations to return (default: 20, max: 100)"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ q, limit = 20 }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          const data = await makeFrontAPIRequest({
            method: "GET",
            endpoint: "conversations",
            apiToken,
            params: { q, limit: Math.min(limit, 100) },
          });

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const conversations = data._results || [];

          if (conversations.length === 0) {
            return new Ok([
              {
                type: "text" as const,
                text: `No conversations found for query: "${q}"`,
              },
            ]);
          }

          const formatted = conversations
            .map((conv: any) => formatConversationForLLM(conv))
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
      }
    )
  );

  server.tool(
    "get_conversation",
    "Retrieve complete details of a specific conversation by its ID, including subject, status, " +
      "assignee, tags, inbox, and all metadata.",
    {
      conversation_id: z
        .string()
        .describe("The unique ID of the conversation (e.g., 'cnv_55c8c149')"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          const data = await makeFrontAPIRequest({
            method: "GET",
            endpoint: `conversations/${conversation_id}`,
            apiToken,
          });

          const formatted = formatConversationForLLM(data);

          return new Ok([
            {
              type: "text" as const,
              text:
                `Retrieved conversation ${conversation_id}` +
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
              `Failed to get conversation: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_conversation_messages",
    "Retrieve all messages in a conversation, including both external messages (emails) and " +
      "internal comments. Returns the complete message timeline.",
    {
      conversation_id: z
        .string()
        .describe("The unique ID of the conversation (e.g., 'cnv_55c8c149')"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          const data = await makeFrontAPIRequest({
            method: "GET",
            endpoint: `conversations/${conversation_id}/messages`,
            apiToken,
          });

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const messages = data._results || [];
          const formatted = formatMessagesForLLM(messages);

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
      }
    )
  );

  server.tool(
    "get_contact",
    "Look up customer/contact information by email address or contact ID. Returns contact details " +
      "including name, email, and custom fields.",
    {
      email: z
        .string()
        .optional()
        .describe("Email address of the contact to look up"),
      contact_id: z
        .string()
        .optional()
        .describe("The unique ID of the contact (e.g., 'crd_55c8c149')"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ email, contact_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          let data;
          if (contact_id) {
            data = await makeFrontAPIRequest({
              method: "GET",
              endpoint: `contacts/${contact_id}`,
              apiToken,
            });
          } else if (email) {
            const searchData = await makeFrontAPIRequest({
              method: "GET",
              endpoint: "contacts",
              apiToken,
              params: { q: email },
            });
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            const contacts = searchData._results || [];
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
            new MCPError(
              `Failed to get contact: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "send_message",
    "Send a reply or internal comment to a conversation. Can send as email reply or internal note.",
    {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      body: z.string().describe("The message content (supports markdown)"),
      type: z
        .enum(["comment", "reply"])
        .default("reply")
        .describe(
          "Type of message: 'comment' for internal note, 'reply' for customer-facing email (default: reply)"
        ),
      author_id: z
        .string()
        .optional()
        .describe(
          "Optional: Teammate ID to send as (defaults to API token owner)"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id, body, type = "reply", author_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          const endpoint =
            type === "comment"
              ? `conversations/${conversation_id}/comments`
              : `conversations/${conversation_id}/messages`;

          // Convert markdown to HTML for better formatting
          const htmlBody = await convertMarkdownToHTML(body);

          const requestBody: any = {
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
            new MCPError(
              `Failed to send message: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "add_tags",
    "Add one or more tags to a conversation for categorization (e.g., bug, feature-request, billing).",
    {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      tag_ids: z
        .array(z.string())
        .describe("Array of tag IDs to add to the conversation"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id, tag_ids }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

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
      }
    )
  );

  server.tool(
    "assign_conversation",
    "Assign a conversation to a specific teammate for handling.",
    {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      teammate_id: z.string().describe("The ID of the teammate to assign to"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id, teammate_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

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
      }
    )
  );

  server.tool(
    "update_conversation_status",
    "Update the status of a conversation (archive, reopen, delete, spam, trash).",
    {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      status: z
        .enum(["archived", "deleted", "open", "spam", "trash"])
        .describe(
          "New status: 'archived' (close), 'open' (reopen), 'deleted', 'spam', 'trash'"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id, status }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

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
      }
    )
  );

  server.tool(
    "list_tags",
    "Get all available tags for categorizing conversations.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async () => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          const data = await makeFrontAPIRequest({
            method: "GET",
            endpoint: "tags",
            apiToken,
          });

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const tags = data._results || [];
          const formatted = tags
            .map(
              (tag: any) =>
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
            new MCPError(
              `Failed to list tags: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "list_teammates",
    "Get all teammates in the workspace for assignment and collaboration.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async () => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          const data = await makeFrontAPIRequest({
            method: "GET",
            endpoint: "teammates",
            apiToken,
          });

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const teammates = data._results || [];
          const formatted = teammates
            .map(
              (tm: any) =>
                `- ${tm.first_name} ${tm.last_name} (${tm.email}) - ID: ${tm.id}${tm.is_available ? "" : " [Away]"}`
            )
            .join("\n");

          return new Ok([
            {
              type: "text" as const,
              text:
                `Found ${teammates.length} teammate(s)` + "\n\n" + formatted,
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
      }
    )
  );

  server.tool(
    "create_draft",
    "Create a draft reply to a conversation for review before sending.",
    {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      body: z.string().describe("The draft message content"),
      author_id: z
        .string()
        .optional()
        .describe("Optional: Teammate ID for the draft author"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id, body, author_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          // Fetch conversation to get inbox information
          const conversation = await makeFrontAPIRequest({
            method: "GET",
            endpoint: `conversations/${conversation_id}`,
            apiToken,
          });

          // Fetch messages to get the last inbound message's recipients
          const messagesData = await makeFrontAPIRequest({
            method: "GET",
            endpoint: `conversations/${conversation_id}/messages`,
            apiToken,
          });

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const messages = messagesData._results || [];

          // Get channel address from conversation context
          // We can use the address directly as a resource alias (alt:address:EMAIL)
          let channelAddress: string | undefined;

          // First, try to use the inbox address from the conversation (most reliable)
          if (conversation.inbox?.address) {
            channelAddress = conversation.inbox.address;
          } else {
            // If inbox address is not available, we need to identify which recipient is a channel
            // by matching recipients from the previous message against available channels
            const lastInboundMessage = messages
              .filter((msg: any) => msg.is_inbound && msg.type !== "comment")
              .sort((a: any, b: any) => b.created_at - a.created_at)[0];

            if (
              lastInboundMessage?.recipients &&
              lastInboundMessage.recipients.length > 0
            ) {
              for (const recipient of lastInboundMessage.recipients) {
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                const recipientAddress = recipient.handle || recipient.email;
                if (!recipientAddress) {
                  continue;
                }

                try {
                  // Try to fetch the channel using resource alias
                  await makeFrontAPIRequest({
                    method: "GET",
                    endpoint: `channels/alt:address:${recipientAddress}`,
                    apiToken,
                  });

                  channelAddress = recipientAddress;
                  break;
                } catch (error) {
                  if (
                    error instanceof MCPError &&
                    error.message.includes("Resource not found")
                  ) {
                    continue;
                  }
                  // For other errors, log but continue trying other recipients
                  logger.warn(
                    {
                      conversation_id,
                      error: normalizeError(error).message,
                    },
                    "[FrontMCP] Error checking if recipient is a channel"
                  );
                }
              }
            } else {
              logger.warn(
                {
                  conversation_id,
                  has_last_inbound_message: !!lastInboundMessage,
                  message_recipients_count:
                    lastInboundMessage?.recipients?.length ?? 0,
                },
                "[FrontMCP] Unable to find channel address from last inbound message"
              );
            }
          }

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
            new MCPError(
              `Failed to create draft: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "add_comment",
    "Add an internal comment/note to a conversation (only visible to team).",
    {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      body: z.string().describe("The comment content"),
      author_id: z
        .string()
        .optional()
        .describe("Optional: Teammate ID for the comment author"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id, body, author_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

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
            new MCPError(
              `Failed to add comment: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_customer_history",
    "Retrieve past conversations with a specific customer by their email address.",
    {
      customer_email: z
        .string()
        .describe("Customer email address to search for"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe(
          "Maximum number of past conversations to return (default: 10)"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ customer_email, limit = 10 }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          // Search for conversations from this customer.
          const data = await makeFrontAPIRequest({
            method: "GET",
            endpoint: "conversations",
            apiToken,
            params: {
              q: `from:${customer_email}`,
              limit: Math.min(limit, 100),
            },
          });

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const conversations = data._results || [];

          if (conversations.length === 0) {
            return new Ok([
              {
                type: "text" as const,
                text: `No past conversations found for customer: ${customer_email}`,
              },
            ]);
          }

          const formatted = conversations
            .map((conv: any) => formatConversationForLLM(conv))
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
      }
    )
  );

  server.tool(
    "list_inboxes",
    "Get all inboxes/channels available in the workspace.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async () => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

          const data = await makeFrontAPIRequest({
            method: "GET",
            endpoint: "inboxes",
            apiToken,
          });

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const inboxes = data._results || [];
          const formatted = inboxes
            .map(
              (inbox: any) =>
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
            new MCPError(
              `Failed to list inboxes: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "create_conversation",
    "Start a new outbound conversation with a customer.",
    {
      inbox_id: z
        .string()
        .describe("The ID of the inbox to create the conversation in"),
      to: z.array(z.string()).describe("Array of recipient email addresses"),
      subject: z.string().describe("Subject line of the conversation"),
      body: z.string().describe("Message body content"),
      author_id: z
        .string()
        .optional()
        .describe("Optional: Teammate ID for the message author"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ inbox_id, to, subject, body, author_id }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

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
      }
    )
  );

  server.tool(
    "add_links",
    "Link related conversations together for better tracking and context.",
    {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      linked_conversation_ids: z
        .array(z.string())
        .describe("Array of conversation IDs to link to"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "front", agentLoopContext },
      async ({ conversation_id, linked_conversation_ids }) => {
        try {
          const apiToken = await getFrontAPIToken(auth, agentLoopContext);

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
            new MCPError(
              `Failed to add links: ${normalizeError(error).message}`
            )
          );
        }
      }
    )
  );

  return server;
};

export default createServer;
