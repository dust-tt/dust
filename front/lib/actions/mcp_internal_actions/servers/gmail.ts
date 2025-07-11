import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "gmail",
  version: "1.0.0",
  description: "Gmail tools for reading emails and managing email drafts.",
  authorization: {
    provider: "google_drive" as const,
    supported_use_cases: ["personal_actions"] as const,
    scope:
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose" as const,
  },
  icon: "GmailLogo",
  documentationUrl: "https://docs.dust.tt/docs/gmail-tool-setup",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

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
    async ({ q, pageToken }, { authInfo }) => {
      const accessToken = authInfo?.token;

      const params = new URLSearchParams();
      if (q) {
        params.append("q", q);
      }
      if (pageToken) {
        params.append("pageToken", pageToken);
      }

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        return makeMCPToolTextError("Failed to get drafts");
      }

      const result = await response.json();

      const drafts = await concurrentExecutor(
        result.drafts ?? [],
        async (draft: { id: string }) => {
          const draftResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draft.id}?format=metadata`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          if (!draftResponse.ok) {
            return null;
          }

          return draftResponse.json();
        },
        { concurrency: 10 }
      );

      return makeMCPToolJSONSuccess({
        message: "Drafts fetched successfully",
        result: {
          drafts,
          nextPageToken: result.nextPageToken,
        },
      });
    }
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
    async ({ to, cc, bcc, subject, contentType, body }, { authInfo }) => {
      const accessToken = authInfo?.token;

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
      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
        const responseText = await response.text();
        return makeMCPToolTextError(`Failed to create draft: ${responseText}`);
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Draft created successfully",
        result: {
          draftId: result.id,
          messageId: result.message.id,
        },
      });
    }
  );

  server.tool(
    "delete_draft",
    "Delete a draft email from Gmail.",
    {
      draftId: z.string().describe("The ID of the draft to delete"),
      subject: z.string().describe("The subject of the draft to delete"),
      to: z.array(z.string()).describe("The email addresses of the recipients"),
    },
    async ({ draftId, subject, to }, { authInfo }) => {
      const accessToken = authInfo?.token;

      assert(subject, "Subject is required - for user display");
      assert(
        to.length > 0,
        "At least one recipient is required - for user display"
      );

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        return makeMCPToolTextError("Failed to delete draft");
      }

      return makeMCPToolJSONSuccess({
        message: "Draft deleted successfully",
        result: "",
      });
    }
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
    async ({ q, maxResults = 10, pageToken }, { authInfo }) => {
      const accessToken = authInfo?.token;

      const params = new URLSearchParams();
      if (q) {
        params.append("q", q);
      }
      params.append("maxResults", Math.min(maxResults, 100).toString());
      if (pageToken) {
        params.append("pageToken", pageToken);
      }

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        return makeMCPToolTextError(
          `Failed to get messages: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      // Get detailed message information for each message
      const messageDetails = await concurrentExecutor(
        result.messages ?? [],
        async (message: { id: string }) => {
          const messageResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          if (!messageResponse.ok) {
            const errorText = await messageResponse
              .text()
              .catch(() => "Unknown error");
            return {
              success: false,
              messageId: message.id,
              error: `${messageResponse.status} ${messageResponse.statusText} - ${errorText}`,
            };
          }

          return {
            success: true,
            data: await messageResponse.json(),
          };
        },
        { concurrency: 10 }
      );

      // Separate successful and failed message details
      const successfulMessages = messageDetails
        .filter((detail: any) => detail.success)
        .map((detail: any) => detail.data);

      const failedMessages = messageDetails
        .filter((detail: any) => !detail.success)
        .map((detail: any) => ({
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

      return makeMCPToolJSONSuccess({
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
      });
    }
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
    async (
      { messageId, body, contentType = "text/plain", to, cc, bcc },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;

      // Fetch the original message to extract threading information and body
      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!messageResponse.ok) {
        const errorText = await messageResponse
          .text()
          .catch(() => "Unknown error");
        if (messageResponse.status === 404) {
          return makeMCPToolTextError(`Message not found: ${messageId}`);
        }
        return makeMCPToolTextError(
          `Failed to get original message: ${messageResponse.status} ${messageResponse.statusText} - ${errorText}`
        );
      }

      const originalMessage = await messageResponse.json();
      const headers = originalMessage.payload?.headers || [];
      const threadId = originalMessage.threadId;

      // Helper to extract a header value
      const getHeader = (name: string) =>
        headers.find(
          (h: { name: string; value: string }) =>
            h.name.toLowerCase() === name.toLowerCase()
        )?.value;

      const originalFrom = getHeader("From");
      const originalTo = getHeader("To");
      const originalCc = getHeader("Cc");
      const originalBcc = getHeader("Bcc");
      const originalSubject = getHeader("Subject");
      const originalMessageId = getHeader("Message-ID");
      const originalReferences = getHeader("References");
      const originalDate = getHeader("Date");

      // Determine recipients for the reply
      const replyTo =
        to && to.length > 0 ? to.join(", ") : originalTo || originalFrom;
      const replyCc = cc && cc.length > 0 ? cc.join(", ") : originalCc;
      const replyBcc = bcc && bcc.length > 0 ? bcc.join(", ") : originalBcc;

      if (!replyTo || replyTo.trim() === "") {
        return makeMCPToolTextError(
          "Cannot determine reply-to address from original message"
        );
      }

      // Create subject line for reply
      const replySubject = originalSubject?.startsWith("Re:")
        ? originalSubject
        : `Re: ${originalSubject || "No Subject"}`;

      // Create threading headers
      const threadingHeaders = [
        originalMessageId ? `In-Reply-To: ${originalMessageId}` : null,
        originalReferences ? `References: ${originalReferences}` : null,
        originalMessageId && !originalReferences
          ? `References: ${originalMessageId}`
          : null,
      ].filter(Boolean);

      // Encode subject line using RFC 2047
      const encodedSubject = `=?UTF-8?B?${Buffer.from(replySubject, "utf-8").toString("base64")}?=`;

      // Helper to decode Gmail message body
      function decodeMessageBody(payload: any): string {
        if (!payload) return "";
        if (payload.mimeType === "text/plain" && payload.body?.data) {
          const base64 = payload.body.data
            .replace(/-/g, "+")
            .replace(/_/g, "/");
          return Buffer.from(base64, "base64").toString("utf-8");
        }
        if (payload.parts) {
          for (const part of payload.parts) {
            const found = decodeMessageBody(part);
            if (found) return found;
          }
        }
        return "";
      }

      const originalBody = decodeMessageBody(originalMessage.payload);

      // Build reply body based on content type
      const escapeHtml = (text: string) =>
        text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      let fullBody: string;
      let contentTypeHeader: string;

      if (contentType === "text/html") {
        // HTML content - don't escape the body, use it as-is
        const replyText = body.trim();

        // Build quote section if original message exists
        let quoteSection = "";
        if (originalBody) {
          const separator =
            originalDate && originalFrom
              ? `On ${escapeHtml(originalDate)}, ${escapeHtml(originalFrom)} wrote:`
              : `${escapeHtml(originalFrom || "Original sender")} wrote:`;

          const quotedOriginal = `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${escapeHtml(originalBody).replace(/\n/g, "<br>")}</blockquote>`;

          quoteSection = `<br><br><div class="gmail_quote">${separator}<br>${quotedOriginal}</div>`;
        }

        fullBody = `<div dir="ltr">${replyText}${quoteSection}</div>`;
        contentTypeHeader = "text/html; charset=UTF-8";
      } else {
        // Plain text content - convert to HTML with escaping
        const replyText = escapeHtml(body.trim()).replace(/\n/g, "<br>");

        // Build quote section if original message exists
        let quoteSection = "";
        if (originalBody) {
          const separator =
            originalDate && originalFrom
              ? `On ${escapeHtml(originalDate)}, ${escapeHtml(originalFrom)} wrote:`
              : `${escapeHtml(originalFrom || "Original sender")} wrote:`;

          const quotedOriginal = `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${escapeHtml(originalBody).replace(/\n/g, "<br>")}</blockquote>`;

          quoteSection = `<br><br><div class="gmail_quote">${separator}<br>${quotedOriginal}</div>`;
        }

        fullBody = `<div dir="ltr"><div>${replyText}</div>${quoteSection}</div>`;
        contentTypeHeader = "text/html; charset=UTF-8";
      }

      // Construct the reply message
      const messageLines = [
        `To: ${replyTo}`,
        replyCc ? `Cc: ${replyCc}` : null,
        replyBcc ? `Bcc: ${replyBcc}` : null,
        `Subject: ${encodedSubject}`,
        `Content-Type: ${contentTypeHeader}`,
        "MIME-Version: 1.0",
        ...threadingHeaders,
        "", // Empty line to separate headers from body (RFC 2822 compliant)
        fullBody, // Body content directly without extra CRLF
      ].filter((line) => line !== null);
      const message = messageLines.join("\r\n");
      console.log(
        "[Gmail Reply Draft MIME Message]\n" + message + "\n[END MIME Message]"
      );

      // Encode the message in base64 as required by the Gmail API
      const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // Create the draft via Gmail API
      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              raw: encodedMessage,
              threadId: threadId,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        return makeMCPToolTextError(
          `Failed to create reply draft: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Reply draft created successfully",
        result: {
          draftId: result.id,
          messageId: result.message.id,
          originalMessageId: messageId,
          replyTo: replyTo,
          subject: replySubject,
        },
      });
    }
  );

  return server;
};

export default createServer;
