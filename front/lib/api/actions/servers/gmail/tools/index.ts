import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { jsonToMarkdown } from "@app/lib/actions/mcp_internal_actions/utils";
import {
  extractTextFromBuffer,
  processAttachment,
} from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import {
  getFileFromConversationAttachment,
  sanitizeFilename,
} from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
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
  findAttachmentIdByPartId,
  getErrorText,
  getHeaderValue,
  isGmailMessage,
  MAX_ATTACHMENT_SIZE_BYTES,
  MESSAGES_MAX_RESULTS,
  MESSAGES_WITH_ATTACHMENTS_MAX_RESULTS,
} from "@app/lib/api/actions/servers/gmail/helpers";
import { GMAIL_TOOLS_METADATA } from "@app/lib/api/actions/servers/gmail/metadata";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { unescape } from "html-escaper";

// Validates email addresses to prevent header injection attacks.
function validateEmailAddresses(
  to: string[],
  cc: string[] | null,
  bcc: string[] | null,
  from?: string
): Err<MCPError> | null {
  const allAddresses = [...to, ...(cc ?? []), ...(bcc ?? [])];
  if (from) {
    allAddresses.push(from);
  }
  for (const addr of allAddresses) {
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
  cc: string[] | null;
  bcc: string[] | null;
  from?: string;
  subject: string;
  contentType: string;
  body: string;
  threadingHeaders?: string[];
  attachment: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  } | null;
}): Err<MCPError> | Ok<string> {
  const encodedSubject = encodeSubject(params.subject);

  // Validate email addresses to prevent header injection
  const validationError = validateEmailAddresses(
    params.to,
    params.cc,
    params.bcc,
    params.from
  );
  if (validationError) {
    return validationError;
  }

  let messageLines: string[];

  const commonLines = [
    `To: ${params.to.join(", ")}`,
    params.from ? `From: ${params.from}` : null,
    params.cc?.length ? `Cc: ${params.cc.join(", ")}` : null,
    params.bcc?.length ? `Bcc: ${params.bcc.join(", ")}` : null,
    `Subject: ${encodedSubject}`,
  ].filter((line): line is string => line !== null);

  if (params.attachment) {
    const boundary = crypto.randomUUID().replace(/-/g, "");
    const safeContentType =
      params.attachment.contentType.replace(/[\r\n]/g, "").trim() ||
      "application/octet-stream";
    // Create the email message with proper headers, content and attachment file
    messageLines = [
      ...commonLines,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "MIME-Version: 1.0",
      ...(params.threadingHeaders ?? []),
      "",
      `--${boundary}`,
      `Content-Type: ${params.contentType}; charset=UTF-8`,
      "",
      params.body,
      "",
      `--${boundary}`,
      `Content-Type: ${safeContentType}; name="${params.attachment.filename}"`,
      `Content-Disposition: attachment; filename="${params.attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      params.attachment.buffer.toString("base64"),
      `--${boundary}--`,
    ];
  } else {
    // Create the email message with proper headers and content.
    messageLines = [
      ...commonLines,
      `Content-Type: ${params.contentType}; charset=UTF-8`,
      "MIME-Version: 1.0",
      ...(params.threadingHeaders ?? []),
      "",
      params.body,
    ];
  }

  const message = messageLines.join("\r\n");
  const encodedMessage = encodeMessageForGmail(message);

  return new Ok(encodedMessage);
}

async function buildReplyContext(params: {
  replyToMessageId: string;
  accessToken: string;
  to: string[] | null;
  cc: string[] | null;
  bcc: string[] | null;
  body: string;
  subject?: string;
}): Promise<
  | Err<MCPError>
  | Ok<{
      threadId: string;
      replyTo: string[];
      replyCc: string[] | null;
      replyBcc: string[] | null;
      originalSubject: string | null;
      fullBody: string;
      threadingHeaders: string[];
    }>
> {
  if (params.subject) {
    return new Err(
      new MCPError("Subject should not be provided when replying to a message.")
    );
  }

  const messageResponse = await fetchFromGmail(
    `/gmail/v1/users/me/messages/${params.replyToMessageId}?format=full`,
    params.accessToken,
    { method: "GET" }
  );

  if (!messageResponse.ok) {
    const errorText = await getErrorText(messageResponse);
    if (messageResponse.status === 404) {
      return new Err(
        new MCPError(`Message not found: ${params.replyToMessageId}`, {
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
  const threadId = originalMessage.threadId ?? "";

  if (!threadId) {
    return new Err(
      new MCPError("Could not determine thread ID from original message")
    );
  }

  // Determine recipients
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const headers = originalMessage.payload?.headers || [];
  const originalFrom = getHeaderValue(headers, "From");
  const originalDate = getHeaderValue(headers, "Date");
  const decodedBody = decodeMessageBody(originalMessage.payload);
  const originalCc = getHeaderValue(headers, "Cc");
  const originalBcc = getHeaderValue(headers, "Bcc");
  const originalSubject = getHeaderValue(headers, "Subject") ?? null;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const replyTo = params.to?.length ? params.to : originalFrom?.split(", ");
  const replyCc = params.cc?.length
    ? params.cc
    : (originalCc?.split(", ") ?? null);
  const replyBcc = params.bcc?.length
    ? params.bcc
    : (originalBcc?.split(", ") ?? null);

  const fullBody = buildReplyBody(
    params.body,
    "text/html",
    decodedBody?.body ?? "",
    decodedBody?.mimeType ?? "text/plain",
    originalDate,
    originalFrom
  );

  // Extract header values
  const originalMessageIdHeader = getHeaderValue(headers, "Message-ID");
  const originalReferences = getHeaderValue(headers, "References");

  // Create subject and headers
  const threadingHeaders = createThreadingHeaders(
    originalMessageIdHeader,
    originalReferences
  );

  if (!replyTo || !replyTo.length) {
    return new Err(
      new MCPError("Cannot determine reply-to address from original message")
    );
  }
  return new Ok({
    threadId,
    replyTo,
    replyCc,
    replyBcc,
    originalSubject,
    fullBody,
    threadingHeaders,
  });
}

async function fetchAttachment(
  auth: ToolHandlerExtra["auth"],
  attachmentFilePath: string | undefined,
  agentLoopContext: ToolHandlerExtra["agentLoopContext"]
): Promise<
  | Ok<{ buffer: Buffer; filename: string; contentType: string } | null>
  | Err<MCPError>
> {
  if (!attachmentFilePath) {
    return new Ok(null);
  }

  if (!agentLoopContext) {
    return new Err(new MCPError("No agent context available"));
  }

  const fileResult = await getFileFromConversationAttachment(
    auth,
    attachmentFilePath,
    agentLoopContext
  );

  if (fileResult.isErr()) {
    return new Err(
      new MCPError(`File not found: ${attachmentFilePath}`, { tracked: false })
    );
  }

  const { buffer, filename, contentType } = fileResult.value;

  if (buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
    return new Err(
      new MCPError(
        `Attachment file size exceeds the ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB limit.`
      )
    );
  }
  return new Ok({ buffer, filename, contentType });
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
    {
      to,
      cc,
      bcc,
      from,
      subject,
      contentType,
      body,
      replyToMessageId,
      attachmentFilePath,
    },
    { authInfo, auth, agentLoopContext }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    // If a from alias was requested, verify it's a configured send-as address
    // before sending. Gmail silently falls back to the primary address if the
    // alias isn't set up, so we fail early to surface the issue.
    if (from) {
      const sendAsResponse = await fetchFromGmail(
        "/gmail/v1/users/me/settings/sendAs",
        accessToken,
        { method: "GET" }
      );
      if (sendAsResponse.ok) {
        const sendAsResult = await sendAsResponse.json();
        const aliases: { sendAsEmail: string }[] = sendAsResult.sendAs ?? [];
        const aliasConfigured = aliases.some(
          (a) => a.sendAsEmail.toLowerCase() === from.toLowerCase()
        );
        if (!aliasConfigured) {
          return new Err(
            new MCPError(
              `"${from}" is not configured as a send-as alias in Gmail settings. The draft was not created.`
            )
          );
        }
      }
    }
    const attachmentResult = await fetchAttachment(
      auth,
      attachmentFilePath,
      agentLoopContext
    );
    if (attachmentResult.isErr()) {
      return attachmentResult;
    }
    const attachment = attachmentResult.value;

    let encodedMessage: string | undefined = undefined;
    let threadId: string | undefined = undefined;

    if (replyToMessageId) {
      if (contentType) {
        return new Err(
          new MCPError(
            "contentType must be omitted when replying to a message."
          )
        );
      }
      const replyContext = await buildReplyContext({
        replyToMessageId,
        accessToken,
        to: to ?? null,
        cc: cc ?? null,
        bcc: bcc ?? null,
        body,
        subject,
      });
      if (replyContext.isErr()) {
        return replyContext;
      }
      const {
        replyTo,
        replyCc,
        replyBcc,
        originalSubject,
        fullBody,
        threadingHeaders,
      } = replyContext.value;
      threadId = replyContext.value.threadId;

      // Build and encode the email message
      const encodedMessageResult = buildAndEncodeEmail({
        to: replyTo,
        cc: replyCc,
        bcc: replyBcc,
        from,
        subject: originalSubject?.startsWith("Re: ")
          ? originalSubject
          : `Re: ${originalSubject ?? "No Subject"}`,
        contentType: "text/html",
        body: fullBody,
        threadingHeaders,
        attachment,
      });
      if (encodedMessageResult.isErr()) {
        return encodedMessageResult;
      }
      encodedMessage = encodedMessageResult.value;
    } else {
      if (!contentType) {
        return new Err(
          new MCPError(
            "contentType is required when not replying to a message."
          )
        );
      }

      if (!subject?.trim()) {
        return new Err(
          new MCPError("Subject is required when not replying to a message.")
        );
      }

      if (!to?.length) {
        return new Err(
          new MCPError(
            "At least one recipient is required when replyToMessageId is not set. Please provide a 'to' address."
          )
        );
      }

      const encodedMessageResult = buildAndEncodeEmail({
        to,
        cc: cc ?? null,
        bcc: bcc ?? null,
        from,
        subject,
        contentType,
        body,
        attachment,
      });

      if (encodedMessageResult.isErr()) {
        return encodedMessageResult;
      }
      encodedMessage = encodedMessageResult.value;
    }
    if (!encodedMessage) {
      return new Err(new MCPError("Failed to encode email"));
    }

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
            ...(threadId ? { threadId: threadId } : {}),
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

  get_labels: async (_, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const response = await fetchFromGmail(
      "/gmail/v1/users/me/labels",
      accessToken,
      { method: "GET" }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(new MCPError(`Failed to get labels: ${errorText}`));
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Labels fetched successfully" },
      {
        type: "text" as const,
        text: JSON.stringify({ labels: result.labels ?? [] }, null, 2),
      },
    ]);
  },

  get_thread: async ({ threadId }, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }
    const response = await fetchFromGmail(
      `/gmail/v1/users/me/threads/${threadId}`,
      accessToken,
      { method: "GET" }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(new MCPError(`Failed to get thread: ${errorText}`));
    }
    const result = await response.json();
    const cleanedMessages = (result.messages ?? []).map(
      (message: GmailMessage) => {
        const headers = message.payload?.headers ?? [];
        const from = getHeaderValue(headers, "From");
        const to = getHeaderValue(headers, "To");
        const date = getHeaderValue(headers, "Date");
        const subject = getHeaderValue(headers, "Subject");
        const body = unescape(
          (decodeMessageBody(message.payload)?.body ?? "")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        );
        return { id: message.id, from, to, date, subject, body };
      }
    );

    return new Ok([
      { type: "text" as const, text: "Thread fetched successfully" },
      {
        type: "text" as const,
        text: JSON.stringify({ messages: cleanedMessages }, null, 2),
      },
    ]);
  },

  set_message_labels: async (
    { messageId, addLabelIds, removeLabelIds },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    if (!addLabelIds?.length && !removeLabelIds?.length) {
      return new Err(
        new MCPError("At least one label ID must be added or removed")
      );
    }

    const encodedMessageId = encodeURIComponent(messageId);

    // To archive a message, remove the "INBOX" system label with removeLabelIds: ["INBOX"].
    const response = await fetchFromGmail(
      `/gmail/v1/users/me/messages/${encodedMessageId}/modify`,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addLabelIds: addLabelIds ?? [],
          removeLabelIds: removeLabelIds ?? [],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(
        new MCPError(`Failed to modify message labels: ${errorText}`)
      );
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Message labels modified successfully" },
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
        const body = decodeMessageBody(messageData.payload)?.body ?? "";

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

    const fetchAttachmentFromApi = async (
      gmailAttachmentId: string
    ): Promise<Result<string, string>> => {
      const response = await fetchFromGmail(
        `/gmail/v1/users/me/messages/${encodedMessageId}/attachments/${encodeURIComponent(gmailAttachmentId)}`,
        accessToken,
        { method: "GET" }
      );
      if (!response.ok) {
        return new Err(await getErrorText(response));
      }
      const body = await response.json();
      if (typeof body.data !== "string") {
        return new Err("Gmail API returned no attachment data");
      }
      return new Ok(body.data);
    };

    let attachmentApiErrorText: string | null = null;

    // Only try the attachments API if we have a real attachment ID
    if (hasRealAttachmentId && attachmentId) {
      const fetchResult = await fetchAttachmentFromApi(attachmentId);
      if (fetchResult.isOk()) {
        base64Data = fetchResult.value;
      } else {
        attachmentApiErrorText = fetchResult.error;
        const lowerError = attachmentApiErrorText.toLowerCase();

        // Gmail attachment IDs are short-lived tokens: an ID obtained from an
        // earlier get_messages call can expire and fail with "invalid
        // attachment token". Fall back to re-fetching the message.
        if (!lowerError.includes("invalid") && !lowerError.includes("token")) {
          return new Err(
            new MCPError(
              `Failed to fetch attachment via Gmail API (messageId: ${messageId}, ` +
                `filename: "${filename}"): ${attachmentApiErrorText}`,
              { tracked: false }
            )
          );
        }
      }
    }

    // Fallback: re-fetch the message, then read inline data (content without a
    // real attachment ID) or retry the attachments API with the fresh
    // attachment ID found in the re-fetched message (expired token case).
    if (!base64Data) {
      const messageResponse = await fetchFromGmail(
        `/gmail/v1/users/me/messages/${encodedMessageId}?format=full`,
        accessToken,
        { method: "GET" }
      );

      if (!messageResponse.ok) {
        const messageErrorText = await getErrorText(messageResponse);
        return new Err(
          new MCPError(
            `Failed to fetch message for attachment fallback (messageId: ${messageId}): ${messageErrorText}`
          )
        );
      }

      const messageData: GmailMessage = await messageResponse.json();
      base64Data = findAttachmentData(messageData.payload, partId);

      if (!base64Data) {
        // Real attachments never carry inline data in the message payload, but
        // the re-fetched message contains a fresh attachment ID for the part.
        // Skip the retry if the ID is unchanged: the same ID just failed above.
        const freshAttachmentId = findAttachmentIdByPartId(
          messageData.payload,
          partId
        );
        if (freshAttachmentId && freshAttachmentId !== attachmentId) {
          const retryResult = await fetchAttachmentFromApi(freshAttachmentId);
          if (retryResult.isOk()) {
            base64Data = retryResult.value;
          } else {
            attachmentApiErrorText = retryResult.error;
          }
        }
      }

      if (!base64Data) {
        return new Err(
          new MCPError(
            `Attachment data not found (messageId: ${messageId}, ` +
              `filename: "${filename}", partId: ${partId}, mimeType: ${mimeType})` +
              (attachmentApiErrorText
                ? `. Gmail API error: ${attachmentApiErrorText}`
                : ".")
          )
        );
      }
    }

    // Gmail returns URL-safe base64, convert to standard base64
    const standardBase64 = base64Data.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(standardBase64, "base64");

    const result = await processAttachment({
      mimeType,
      filename,
      extractText: async () => extractTextFromBuffer(buffer, mimeType),
      downloadContent: async () => new Ok(buffer),
    });

    if (result.isErr()) {
      return result;
    }

    // Always include the binary file as a resource so it can be used by other tools.
    const hasResource = result.value.some((c) => c.type === "resource");
    if (!hasResource) {
      result.value.push({
        type: "resource" as const,
        resource: {
          blob: standardBase64,
          _meta: { text: `Attachment: ${sanitizeFilename(filename)}` },
          mimeType,
          uri: "",
        },
      });
    }

    return result;
  },

  send_mail: async (
    {
      to,
      cc,
      bcc,
      from,
      subject,
      contentType,
      body,
      replyToMessageId,
      attachmentFilePath,
    },
    { authInfo, auth, agentLoopContext }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }
    // If a from alias was requested, verify it's a configured send-as address
    // before sending. Gmail silently falls back to the primary address if the
    // alias isn't set up, so we fail early to surface the issue.
    if (from) {
      const sendAsResponse = await fetchFromGmail(
        "/gmail/v1/users/me/settings/sendAs",
        accessToken,
        { method: "GET" }
      );
      if (sendAsResponse.ok) {
        const sendAsResult = await sendAsResponse.json();
        const aliases: { sendAsEmail: string }[] = sendAsResult.sendAs ?? [];
        const aliasConfigured = aliases.some(
          (a) => a.sendAsEmail.toLowerCase() === from.toLowerCase()
        );
        if (!aliasConfigured) {
          return new Err(
            new MCPError(
              `"${from}" is not configured as a send-as alias in Gmail settings. The email was not sent.`
            )
          );
        }
      }
    }
    const attachmentResult = await fetchAttachment(
      auth,
      attachmentFilePath,
      agentLoopContext
    );
    if (attachmentResult.isErr()) {
      return attachmentResult;
    }
    const attachment = attachmentResult.value;

    let encodedMessage: string | undefined = undefined;
    let threadId: string | undefined = undefined;

    if (replyToMessageId) {
      if (contentType) {
        return new Err(
          new MCPError(
            "contentType must be omitted when replying to a message."
          )
        );
      }
      const replyContext = await buildReplyContext({
        replyToMessageId,
        accessToken,
        to: to ?? null,
        cc: cc ?? null,
        bcc: bcc ?? null,
        body,
        subject,
      });
      if (replyContext.isErr()) {
        return replyContext;
      }

      const {
        replyTo,
        replyCc,
        replyBcc,
        originalSubject,
        fullBody,
        threadingHeaders,
      } = replyContext.value;
      threadId = replyContext.value.threadId;

      // Build and encode the email message
      const encodedMessageResult = buildAndEncodeEmail({
        to: replyTo,
        cc: replyCc,
        bcc: replyBcc,
        from,
        subject: originalSubject?.startsWith("Re: ")
          ? originalSubject
          : `Re: ${originalSubject ?? "No Subject"}`,
        contentType: "text/html",
        body: fullBody,
        threadingHeaders,
        attachment,
      });

      if (encodedMessageResult.isErr()) {
        return encodedMessageResult;
      }
      encodedMessage = encodedMessageResult.value;
    } else {
      if (!contentType) {
        return new Err(
          new MCPError(
            "contentType is required when not replying to a message."
          )
        );
      }

      if (!subject?.trim()) {
        return new Err(
          new MCPError("Subject is required when not replying to a message.")
        );
      }

      if (!to?.length) {
        return new Err(
          new MCPError(
            "At least one recipient is required when replyToMessageId is not set. Please provide a 'to' address."
          )
        );
      }

      const encodedMessageResult = buildAndEncodeEmail({
        to,
        cc: cc ?? null,
        bcc: bcc ?? null,
        from,
        subject,
        contentType,
        body,
        attachment,
      });

      if (encodedMessageResult.isErr()) {
        return encodedMessageResult;
      }
      encodedMessage = encodedMessageResult.value;
    }

    if (!encodedMessage) {
      return new Err(new MCPError("Failed to encode email"));
    }

    // Make the API call to send email in Gmail.
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
          ...(threadId ? { threadId: threadId } : {}),
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
