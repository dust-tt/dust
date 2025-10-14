import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageBody {
  data?: string;
  size?: number;
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessageBody;
  parts?: GmailMessagePart[];
}

interface GmailMessagePayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessageBody;
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePayload;
  sizeEstimate?: number;
  historyId?: string;
  internalDate?: string;
}

interface MessageDetail {
  success: boolean;
  data?: GmailMessage;
  messageId?: string;
  error?: string;
}

const createServer = (auth: Authenticator): McpServer => {
  const server = makeInternalMCPServer("gmail");

  server.tool(
    "get_drafts",
    "Get all drafts from Gmail.",
    {
      q: z
        .string()
        .optional()
        .describe(
          'Only return draft messages matching the specified query. Supports the same query format as the Gmail search box. For example, "from:someuser@example.com rfc822msgid:<somemsgid@example.com> is:unread".'
        ),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "gmail",
        skipAlerting: true,
      },
      async ({ q, pageToken }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const params = new URLSearchParams();
        if (q) {
          params.append("q", q);
        }
        if (pageToken) {
          params.append("pageToken", pageToken);
        }

        const response = await fetchFromGmail(
          `/gmail/v1/users/me/drafts?${params.toString()}`,
          accessToken,
          { method: "GET" }
        );

        if (!response.ok) {
          return new Err(new MCPError("Failed to get drafts"));
        }

        const result = await response.json();

        const drafts = await concurrentExecutor(
          result.drafts ?? [],
          async (draft: { id: string }) => {
            const draftResponse = await fetchFromGmail(
              `/gmail/v1/users/me/drafts/${draft.id}?format=metadata`,
              accessToken,
              { method: "GET" }
            );

            if (!draftResponse.ok) {
              return null;
            }

            return draftResponse.json();
          },
          { concurrency: 10 }
        );

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Drafts fetched successfully",
            result: {
              drafts,
              nextPageToken: result.nextPageToken,
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "create_draft",
    `Create a new email draft in Gmail.
- The draft will be saved in the user's Gmail account and can be reviewed and sent later.
- The user can review and send the draft later
- The draft will include proper email headers and formatting`,
    {
      to: z.array(z.string()).describe("The email addresses of the recipients"),
      cc: z.array(z.string()).optional().describe("The email addresses to CC"),
      bcc: z
        .array(z.string())
        .optional()
        .describe("The email addresses to BCC"),
      subject: z.string().describe("The subject line of the email"),
      contentType: z
        .enum(["text/plain", "text/html"])
        .describe("The content type of the email (text/plain or text/html)."),
      body: z.string().describe("The body of the email"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "gmail",
        skipAlerting: true,
      },
      async ({ to, cc, bcc, subject, contentType, body }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        // Always encode subject line using RFC 2047 to handle any special characters
        const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;

        // Create the email message with proper headers and content.
        const message = [
          `To: ${to.join(", ")}`,
          cc?.length ? `Cc: ${cc.join(", ")}` : null,
          bcc?.length ? `Bcc: ${bcc.join(", ")}` : null,
          `Subject: ${encodedSubject}`,
          "Content-Type: " + contentType,
          "MIME-Version: 1.0",
          "",
          body,
        ]
          .filter((line) => line !== null)
          .join("\n");

        // Encode the message in base64 as required by the Gmail API.
        const encodedMessage = Buffer.from(message)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        // Make the API call to create the draft in Gmail.
        const response = await fetchFromGmail(
          "/gmail/v1/users/me/drafts",
          accessToken,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                raw: encodedMessage,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await getErrorText(response);
          return new Err(new MCPError(`Failed to create draft: ${errorText}`));
        }

        const result = await response.json();

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Draft created successfully",
            result: {
              draftId: result.id,
              messageId: result.message.id,
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "delete_draft",
    "Delete a draft email from Gmail.",
    {
      draftId: z.string().describe("The ID of the draft to delete"),
      subject: z.string().describe("The subject of the draft to delete"),
      to: z.array(z.string()).describe("The email addresses of the recipients"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "gmail",
        skipAlerting: true,
      },
      async ({ draftId, subject, to }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        assert(subject, "Subject is required - for user display");
        assert(
          to.length > 0,
          "At least one recipient is required - for user display"
        );

        const response = await fetchFromGmail(
          `/gmail/v1/users/me/drafts/${draftId}`,
          accessToken,
          { method: "DELETE" }
        );

        if (!response.ok) {
          return new Err(new MCPError("Failed to delete draft"));
        }

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Draft deleted successfully",
            result: "",
          }).content
        );
      }
    )
  );

  server.tool(
    "get_messages",
    "Get messages from Gmail inbox. Supports Gmail search queries to filter messages.",
    {
      q: z
        .string()
        .optional()
        .describe(
          'Gmail search query to filter messages. Supports the same query format as the Gmail search box. Examples: "from:someone@example.com", to:example.com, "subject:meeting", "is:unread", "label:important". Leave empty to get recent messages.'
        ),
      maxResults: z
        .number()
        .optional()
        .describe(
          "Maximum number of messages to return (default: 10, max: 100)"
        ),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "gmail",
        skipAlerting: true,
      },
      async ({ q, maxResults = 10, pageToken }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const params = new URLSearchParams();
        if (q) {
          params.append("q", q);
        }
        params.append("maxResults", Math.min(maxResults, 100).toString());
        if (pageToken) {
          params.append("pageToken", pageToken);
        }

        const response = await fetchFromGmail(
          `/gmail/v1/users/me/messages?${params.toString()}`,
          accessToken,
          { method: "GET" }
        );

        if (!response.ok) {
          const errorText = await getErrorText(response);
          return new Err(
            new MCPError(
              `Failed to get messages: ${response.status} ${response.statusText} - ${errorText}`
            )
          );
        }

        const result = await response.json();

        // Get detailed message information for each message
        const messageDetails = await concurrentExecutor(
          result.messages ?? [],
          async (message: { id: string }) => {
            const messageResponse = await fetchFromGmail(
              `/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References`,
              accessToken,
              { method: "GET" }
            );

            if (!messageResponse.ok) {
              const errorText = await getErrorText(messageResponse);
              return {
                success: false,
                messageId: message.id,
                error: `${messageResponse.status} ${messageResponse.statusText} - ${errorText}`,
              };
            }

            const messageData = await messageResponse.json();
            return {
              success: true,
              data: messageData,
            };
          },
          { concurrency: 10 }
        );

        // Separate successful and failed message details
        const successfulMessages = messageDetails
          .filter((detail: MessageDetail) => detail.success)
          .map((detail: MessageDetail) => detail.data);

        const failedMessages = messageDetails
          .filter((detail: MessageDetail) => !detail.success)
          .map((detail: MessageDetail) => ({
            messageId: detail.messageId,
            error: detail.error,
          }));

        const totalRequested = result.messages?.length || 0;
        const totalSuccessful = successfulMessages.length;
        const totalFailed = failedMessages.length;

        let message = "Messages fetched successfully";
        if (totalFailed > 0) {
          message = `Messages fetched with ${totalFailed} failures out of ${totalRequested} total messages`;
        }

        return new Ok(
          makeMCPToolJSONSuccess({
            message,
            result: {
              messages: successfulMessages,
              failedMessages,
              summary: {
                totalRequested,
                totalSuccessful,
                totalFailed,
              },
              nextPageToken: result.nextPageToken,
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "create_reply_draft",
    `Create a reply draft to an existing email thread in Gmail.
- The draft will be saved in the user's Gmail account and can be reviewed and sent later.
- The reply will be properly formatted with the original message quoted.
- The draft will include proper email headers and threading information.`,
    {
      messageId: z.string().describe("The ID of the message to reply to"),
      body: z.string().describe("The body of the reply email"),
      contentType: z
        .enum(["text/plain", "text/html"])
        .optional()
        .describe(
          "The content type of the email (text/plain or text/html). Defaults to text/plain."
        ),
      to: z
        .array(z.string())
        .optional()
        .describe("Override the To recipients for the reply."),
      cc: z
        .array(z.string())
        .optional()
        .describe("Override the CC recipients for the reply."),
      bcc: z
        .array(z.string())
        .optional()
        .describe("Override the BCC recipients for the reply."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "gmail",
        skipAlerting: true,
      },
      async (
        { messageId, body, contentType = "text/plain" as const, to, cc, bcc },
        { authInfo }
      ) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        // Fetch the original message
        const messageResponse = await fetchFromGmail(
          `/gmail/v1/users/me/messages/${messageId}?format=full`,
          accessToken,
          { method: "GET" }
        );

        if (!messageResponse.ok) {
          const errorText = await getErrorText(messageResponse);
          if (messageResponse.status === 404) {
            return new Err(
              new MCPError(`Message not found: ${messageId}`, {
                tracked: false,
              })
            );
          }
          return new Err(
            new MCPError(
              `Failed to get original message: ${messageResponse.status} ${messageResponse.statusText} - ${errorText}`
            )
          );
        }

        const originalMessage: GmailMessage = await messageResponse.json();
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const headers = originalMessage.payload?.headers || [];

        // Extract header values
        const originalFrom = getHeaderValue(headers, "From");
        const originalTo = getHeaderValue(headers, "To");
        const originalCc = getHeaderValue(headers, "Cc");
        const originalBcc = getHeaderValue(headers, "Bcc");
        const originalSubject = getHeaderValue(headers, "Subject");
        const originalMessageId = getHeaderValue(headers, "Message-ID");
        const originalReferences = getHeaderValue(headers, "References");
        const originalDate = getHeaderValue(headers, "Date");

        // Determine recipients
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const replyTo = to?.length ? to.join(", ") : originalTo || originalFrom;
        const replyCc = cc?.length ? cc.join(", ") : originalCc;
        const replyBcc = bcc?.length ? bcc.join(", ") : originalBcc;

        if (!replyTo?.trim()) {
          return new Err(
            new MCPError(
              "Cannot determine reply-to address from original message"
            )
          );
        }

        // Create subject and headers
        const replySubject = originalSubject?.startsWith("Re:")
          ? originalSubject
          : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            `Re: ${originalSubject || "No Subject"}`;
        const encodedSubject = `=?UTF-8?B?${Buffer.from(replySubject, "utf-8").toString("base64")}?=`;
        const threadingHeaders = createThreadingHeaders(
          originalMessageId,
          originalReferences
        );

        // Build reply body
        const originalBody = decodeMessageBody(originalMessage.payload);
        const fullBody = buildReplyBody(
          body,
          contentType,
          originalBody,
          originalDate,
          originalFrom
        );

        // Construct the reply message
        const messageLines = [
          `To: ${replyTo}`,
          replyCc ? `Cc: ${replyCc}` : null,
          replyBcc ? `Bcc: ${replyBcc}` : null,
          `Subject: ${encodedSubject}`,
          "Content-Type: text/html; charset=UTF-8",
          "MIME-Version: 1.0",
          ...threadingHeaders,
          "",
          fullBody,
        ].filter((line): line is string => line !== null);

        const message = messageLines.join("\r\n");

        // Encode the message in base64 as required by the Gmail API
        const encodedMessage = Buffer.from(message)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const response = await fetchFromGmail(
          "/gmail/v1/users/me/drafts",
          accessToken,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                raw: encodedMessage,
                threadId: originalMessage.threadId,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await getErrorText(response);
          return new Err(
            new MCPError(
              `Failed to create reply draft: ${response.status} ${response.statusText} - ${errorText}`
            )
          );
        }

        const result = await response.json();

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Reply draft created successfully",
            result: {
              draftId: result.id,
              messageId: result.message.id,
              originalMessageId: messageId,
              replyTo,
              subject: replySubject,
            },
          }).content
        );
      }
    )
  );

  return server;
};

const decodeMessageBody = (
  payload: GmailMessagePayload | undefined
): string => {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    const base64 = payload.body.data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const found = decodeMessageBody(part);
      if (found) {
        return found;
      }
    }
  }

  return "";
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const createQuoteSection = (
  originalBody: string,
  originalDate: string | undefined,
  originalFrom: string | undefined
): string => {
  if (!originalBody) {
    return "";
  }

  const separator =
    originalDate && originalFrom
      ? `On ${escapeHtml(originalDate)}, ${escapeHtml(originalFrom)} wrote:`
      : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        `${escapeHtml(originalFrom || "Original sender")} wrote:`;

  const quotedOriginal = `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${escapeHtml(originalBody).replace(/\n/g, "<br>")}</blockquote>`;

  return `<br><br><div class="gmail_quote">${separator}<br>${quotedOriginal}</div>`;
};

const buildReplyBody = (
  userBody: string,
  contentType: "text/plain" | "text/html",
  originalBody: string,
  originalDate: string | undefined,
  originalFrom: string | undefined
): string => {
  const quoteSection = createQuoteSection(
    originalBody,
    originalDate,
    originalFrom
  );

  if (contentType === "text/html") {
    // HTML content - use as-is
    return `<div dir="ltr">${userBody.trim()}${quoteSection}</div>`;
  } else {
    // Plain text content - convert to HTML with escaping
    const escapedBody = escapeHtml(userBody.trim()).replace(/\n/g, "<br>");
    return `<div dir="ltr"><div>${escapedBody}</div>${quoteSection}</div>`;
  }
};

const getHeaderValue = (
  headers: GmailHeader[],
  name: string
): string | undefined =>
  headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

const createThreadingHeaders = (
  originalMessageId: string | undefined,
  originalReferences: string | undefined
): string[] => {
  const headers: string[] = [];

  if (originalMessageId) {
    headers.push(`In-Reply-To: ${originalMessageId}`);

    if (originalReferences) {
      headers.push(`References: ${originalReferences}`);
    } else {
      headers.push(`References: ${originalMessageId}`);
    }
  }

  return headers;
};

const fetchFromGmail = async (
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> => {
  return fetch(`https://gmail.googleapis.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });
};

const getErrorText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "Unknown error";
  }
};

export default createServer;
