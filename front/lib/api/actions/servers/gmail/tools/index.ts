import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { jsonToMarkdown } from "@app/lib/actions/mcp_internal_actions/utils";
import {
  extractTextFromBuffer,
  processAttachment,
} from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import type {
  GmailMessage,
  MessageDetail,
} from "@app/lib/api/actions/servers/gmail/helpers";
import {
  buildReplyBody,
  createThreadingHeaders,
  decodeMessageBody,
  encodeMessageForGmail,
  encodeSubject,
  extractAttachments,
  fetchFromGmail,
  findAttachmentData,
  getErrorText,
  getHeaderValue,
  isGmailMessage,
  MESSAGES_MAX_RESULTS,
  MESSAGES_WITH_ATTACHMENTS_MAX_RESULTS,
} from "@app/lib/api/actions/servers/gmail/helpers";
import { GMAIL_TOOLS_METADATA } from "@app/lib/api/actions/servers/gmail/metadata";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

// Validates email addresses to prevent header injection attacks.
function validateEmailAddresses(
  to: string[],
  cc?: string[],
  bcc?: string[]
): Err<MCPError> | null {
  for (const addr of [...to, ...(cc ?? []), ...(bcc ?? [])]) {
    if (addr.includes("\r") || addr.includes("\n")) {
      return new Err(new MCPError("Invalid email address"));
    }
  }
  return null;
}

// Builds and encodes an email message for Gmail API.
// Used by both create_draft and send_mail to avoid code duplication.
function buildAndEncodeEmail(params: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  contentType: string;
  body: string;
}): Err<MCPError> | Ok<string> {
  const encodedSubject = encodeSubject(params.subject);

  // Validate email addresses to prevent header injection
  const validationError = validateEmailAddresses(
    params.to,
    params.cc,
    params.bcc
  );
  if (validationError) {
    return validationError;
  }

  // Create the email message with proper headers and content.
  const messageLines = [
    `To: ${params.to.join(", ")}`,
    params.cc?.length ? `Cc: ${params.cc.join(", ")}` : null,
    params.bcc?.length ? `Bcc: ${params.bcc.join(", ")}` : null,
    `Subject: ${encodedSubject}`,
    `Content-Type: ${params.contentType}; charset=UTF-8`,
    "MIME-Version: 1.0",
    "",
    params.body,
  ].filter((line): line is string => line !== null);

  const message = messageLines.join("\r\n");
  const encodedMessage = encodeMessageForGmail(message);

  return new Ok(encodedMessage);
}

const handlers: ToolHandlers<typeof GMAIL_TOOLS_METADATA> = {
  get_drafts: async ({ q, pageToken }, { authInfo }) => {
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

    return new Ok([
      { type: "text" as const, text: "Drafts fetched successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            drafts,
            nextPageToken: result.nextPageToken,
          },
          null,
          2
        ),
      },
    ]);
  },

  create_draft: async (
    { to, cc, bcc, subject, contentType, body },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    // Build and encode the email message
    const encodedMessageResult = buildAndEncodeEmail({
      to,
      cc,
      bcc,
      subject,
      contentType,
      body,
    });

    if (encodedMessageResult.isErr()) {
      return encodedMessageResult;
    }

    const encodedMessage = encodedMessageResult.value;

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

    return new Ok([
      { type: "text" as const, text: "Draft created successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            draftId: result.id,
            messageId: result.message.id,
          },
          null,
          2
        ),
      },
    ]);
  },

  delete_draft: async ({ draftId, subject, to }, { authInfo }) => {
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

    return new Ok([
      { type: "text" as const, text: "Draft deleted successfully" },
    ]);
  },

  get_messages: async (
    { q, maxResults = 10, pageToken, includeAttachments },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const params = new URLSearchParams();
    if (q) {
      params.append("q", q);
    }
    params.append(
      "maxResults",
      Math.min(
        maxResults,
        includeAttachments
          ? MESSAGES_WITH_ATTACHMENTS_MAX_RESULTS
          : MESSAGES_MAX_RESULTS
      ).toString()
    );
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
          `/gmail/v1/users/me/messages/${message.id}?format=full`,
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

        if (!isGmailMessage(messageData)) {
          return {
            success: false,
            messageId: message.id,
            error: "Invalid message format received from Gmail API",
          };
        }

        // Extract headers for easy access
        const headers = messageData.payload?.headers ?? [];
        const from = getHeaderValue(headers, "From");
        const to = getHeaderValue(headers, "To");
        const cc = getHeaderValue(headers, "Cc");
        const subject = getHeaderValue(headers, "Subject");
        const date = getHeaderValue(headers, "Date");

        // Decode the full email body
        const body = decodeMessageBody(messageData.payload);

        // Extract attachment metadata
        const attachments = includeAttachments
          ? extractAttachments(messageData.payload)
          : null;

        return {
          success: true,
          data: {
            id: messageData.id,
            threadId: messageData.threadId,
            labelIds: messageData.labelIds,
            from,
            to,
            cc,
            subject,
            date,
            body,
            attachments,
          },
        };
      },
      { concurrency: 10 }
    );

    // Extract successful message details
    const successfulMessages = messageDetails
      .filter((detail: MessageDetail) => detail.success)
      .map((detail: MessageDetail) => detail.data);

    const markdownOutput = jsonToMarkdown(successfulMessages, "id", "Mail id");

    return new Ok([
      { type: "text" as const, text: "Messages fetched successfully" },
      {
        type: "text" as const,
        text: markdownOutput,
      },
    ]);
  },

  get_attachment: async (
    {
      messageId,
      attachmentId,
      partId,
      filename,
      mimeType,
      hasRealAttachmentId,
    },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const encodedMessageId = encodeURIComponent(messageId);
    let base64Data: string | null = null;

    // Only try the attachments API if we have a real attachment ID
    if (hasRealAttachmentId && attachmentId) {
      const encodedAttachmentId = encodeURIComponent(attachmentId);
      const response = await fetchFromGmail(
        `/gmail/v1/users/me/messages/${encodedMessageId}/attachments/${encodedAttachmentId}`,
        accessToken,
        { method: "GET" }
      );

      if (response.ok) {
        const result = await response.json();
        base64Data = result.data;
      } else {
        const attachmentErrorText = await getErrorText(response);
        return new Err(
          new MCPError(
            `Failed to fetch attachment via API: ${attachmentErrorText}`
          )
        );
      }
    } else {
      // For inline content (no real attachmentId), fetch from message body
      const messageResponse = await fetchFromGmail(
        `/gmail/v1/users/me/messages/${encodedMessageId}?format=full`,
        accessToken,
        { method: "GET" }
      );

      if (!messageResponse.ok) {
        const messageErrorText = await getErrorText(messageResponse);
        return new Err(
          new MCPError(`Failed to fetch message: ${messageErrorText}`)
        );
      }

      const messageData: GmailMessage = await messageResponse.json();
      base64Data = findAttachmentData(messageData.payload, partId);

      if (!base64Data) {
        return new Err(
          new MCPError(
            `Inline attachment data not found in message body. This attachment may not be retrievable.`
          )
        );
      }
    }

    if (!base64Data) {
      return new Err(new MCPError("Failed to retrieve attachment data"));
    }

    // Gmail returns URL-safe base64, convert to standard base64
    const standardBase64 = base64Data.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(standardBase64, "base64");

    return processAttachment({
      mimeType,
      filename,
      extractText: async () => extractTextFromBuffer(buffer, mimeType),
      downloadContent: async () => new Ok(buffer),
    });
  },

  create_reply_draft: async (
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
    const originalMessageIdHeader = getHeaderValue(headers, "Message-ID");
    const originalReferences = getHeaderValue(headers, "References");
    const originalDate = getHeaderValue(headers, "Date");

    // Validate user-provided email addresses to prevent header injection
    if (to?.length || cc?.length || bcc?.length) {
      const validationError = validateEmailAddresses(to ?? [], cc, bcc);
      if (validationError) {
        return validationError;
      }
    }

    // Determine recipients
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const replyTo = to?.length ? to.join(", ") : originalTo || originalFrom;
    const replyCc = cc?.length ? cc.join(", ") : originalCc;
    const replyBcc = bcc?.length ? bcc.join(", ") : originalBcc;

    if (!replyTo?.trim()) {
      return new Err(
        new MCPError("Cannot determine reply-to address from original message")
      );
    }

    // Create subject and headers
    const replySubject = originalSubject?.startsWith("Re:")
      ? originalSubject
      : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        `Re: ${originalSubject || "No Subject"}`;
    const encodedSubject = encodeSubject(replySubject);
    const threadingHeaders = createThreadingHeaders(
      originalMessageIdHeader,
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
    const encodedMessage = encodeMessageForGmail(message);

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

    return new Ok([
      { type: "text" as const, text: "Reply draft created successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            draftId: result.id,
            messageId: result.message.id,
            originalMessageId: messageId,
            replyTo,
            subject: replySubject,
          },
          null,
          2
        ),
      },
    ]);
  },

  send_mail: async (
    { to, cc, bcc, subject, contentType, body },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    // Build and encode the email message
    const encodedMessageResult = buildAndEncodeEmail({
      to,
      cc,
      bcc,
      subject,
      contentType,
      body,
    });

    if (encodedMessageResult.isErr()) {
      return encodedMessageResult;
    }

    const encodedMessage = encodedMessageResult.value;

    const response = await fetchFromGmail(
      "/gmail/v1/users/me/messages/send",
      accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: encodedMessage,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(new MCPError(`Failed to send email: ${errorText}`));
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Email sent successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            messageId: result.id,
            threadId: result.threadId,
            labelIds: result.labelIds,
          },
          null,
          2
        ),
      },
    ]);
  },
};

export const TOOLS = buildTools(GMAIL_TOOLS_METADATA, handlers);
