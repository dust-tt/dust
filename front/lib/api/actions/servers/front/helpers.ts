import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { decrypt } from "@app/types/shared/utils/hashing";

export const FRONT_API_BASE_URL = "https://api2.frontapp.com";

export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 1000;
export const MAX_RETRY_DELAY_MS = 10000;

export interface FrontAPIOptions {
  method: string;
  endpoint: string;
  apiToken: string;
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export const convertMarkdownToHTML = async (text: string): Promise<string> => {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  const html = await marked.parse(text);

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  });

  return sanitized.replace(
    /<a href="(.*?)">/g,
    '<a href="$1" target="_blank">'
  );
};

export const makeFrontAPIRequest = async (
  options: FrontAPIOptions,
  retryCount = 0
): Promise<unknown> => {
  const { method, endpoint, apiToken, body, params } = options;

  const url = new URL(`${FRONT_API_BASE_URL}/${endpoint}`);

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

  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(url.toString(), {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  });

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

  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return null;
  }

  return response.json();
};

export async function getFrontAPIToken(
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

  const secret = await DustAppSecretModel.findOne({
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

export async function getFrontAPITokenFromExtra(
  extra: ToolHandlerExtra
): Promise<string> {
  if (!extra.auth) {
    throw new MCPError("No authenticator provided");
  }
  return getFrontAPIToken(extra.auth, extra.agentLoopContext);
}

interface FrontConversation {
  id: string;
  status: string;
  subject?: string;
  assignee?: { email: string };
  inbox?: { name: string; address?: string };
  tags?: Array<{ name: string }>;
  created_at?: number;
  last_message?: { received_at?: number };
  recipient?: { handle?: string; name?: string };
}

export function formatConversationForLLM(
  conversation: FrontConversation
): string {
  const assigneeEmail = conversation.assignee
    ? conversation.assignee.email
    : "Unassigned";
  const inboxName = conversation.inbox?.name ?? "Unknown";
  const tagNames = conversation.tags?.map((t) => t.name).join(", ") ?? "None";
  const createdAt = conversation.created_at
    ? new Date(conversation.created_at * 1000).toISOString()
    : "Unknown";
  const lastMessageAt = conversation.last_message?.received_at
    ? new Date(conversation.last_message.received_at * 1000).toISOString()
    : "None";
  const recipient = conversation.recipient
    ? (conversation.recipient.handle ?? conversation.recipient.name)
    : "Unknown";

  const metadata = `<conversation id="${conversation.id}" status="${conversation.status}">
  SUBJECT: ${conversation.subject ?? "(No subject)"}
  STATUS: ${conversation.status}
  ASSIGNEE: ${assigneeEmail}
  INBOX: ${inboxName}
  TAGS: ${tagNames}
  CREATED: ${createdAt}
  LAST_MESSAGE: ${lastMessageAt}
  RECIPIENT: ${recipient}
  </conversation>`;

  return metadata;
}

interface FrontRecipient {
  handle?: string;
  name?: string;
  email?: string;
}

interface FrontMessage {
  created_at: number;
  type?: string;
  is_inbound?: boolean;
  author?: { email?: string; username?: string };
  recipients?: FrontRecipient[];
  subject?: string;
  body?: string;
  text?: string;
  attachments?: Array<{ filename: string }>;
}

export function formatMessagesForLLM(messages: FrontMessage[]): string {
  if (messages.length === 0) {
    return "No messages found.";
  }

  const sortedMessages = [...messages].sort(
    (a, b) => a.created_at - b.created_at
  );

  const timeline = sortedMessages
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
          ? `\n  ATTACHMENTS:\n${msg.attachments.map((a) => `  - ${a.filename}`).join("\n")}`
          : "";

      const authorName = msg.author?.email ?? msg.author?.username ?? "Unknown";
      const recipientNames =
        msg.recipients?.map((r) => r.handle ?? r.name).join(", ") ?? "N/A";

      return `<entry index="${index + 1}" type="${type}">
  FROM: ${authorName}
  TO: ${recipientNames}
  TIMESTAMP: ${timestamp}
  ${msg.subject ? `SUBJECT: ${msg.subject}\n` : ""}CONTENT:
  ${msg.body ?? msg.text ?? ""}${attachmentInfo}
  </entry>`;
    })
    .join("\n\n");

  const metadata = `<conversation_timeline>
  TOTAL_MESSAGES: ${sortedMessages.length}
  TIMELINE_START: ${new Date(sortedMessages[0].created_at * 1000).toISOString()}
  TIMELINE_END: ${new Date(sortedMessages[sortedMessages.length - 1].created_at * 1000).toISOString()}
  </conversation_timeline>\n\n`;

  return metadata + timeline;
}

interface FrontMessagesResponse {
  _results?: FrontMessage[];
}

export async function findChannelAddress(
  apiToken: string,
  conversationId: string,
  conversation: FrontConversation,
  messagesData: FrontMessagesResponse
): Promise<string | null> {
  const messages = messagesData._results ?? [];

  if (conversation.inbox?.address) {
    return conversation.inbox.address;
  }

  const lastInboundMessage = messages
    .filter((msg) => msg.is_inbound && msg.type !== "comment")
    .sort((a, b) => b.created_at - a.created_at)[0];

  if (
    !lastInboundMessage?.recipients ||
    lastInboundMessage.recipients.length === 0
  ) {
    logger.warn(
      {
        conversation_id: conversationId,
        has_last_inbound_message: !!lastInboundMessage,
        message_recipients_count: lastInboundMessage?.recipients?.length ?? 0,
      },
      "[FrontMCP] Unable to find channel address from last inbound message"
    );
    return null;
  }

  for (const recipient of lastInboundMessage.recipients) {
    const recipientAddress = recipient.handle ?? recipient.email;
    if (!recipientAddress) {
      continue;
    }

    try {
      await makeFrontAPIRequest({
        method: "GET",
        endpoint: `channels/alt:address:${recipientAddress}`,
        apiToken,
      });

      return recipientAddress;
    } catch (error) {
      if (
        error instanceof MCPError &&
        error.message.includes("Resource not found")
      ) {
        continue;
      }
      logger.warn(
        {
          conversation_id: conversationId,
          error: normalizeError(error).message,
        },
        "[FrontMCP] Error checking if recipient is a channel"
      );
    }
  }

  return null;
}
