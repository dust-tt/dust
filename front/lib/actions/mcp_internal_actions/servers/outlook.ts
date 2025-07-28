import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

interface OutlookEmailAddress {
  address: string;
  name?: string;
}

interface OutlookRecipient {
  emailAddress: OutlookEmailAddress;
}

interface OutlookMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  importance?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  isDraft?: boolean;
  isRead?: boolean;
  from?: OutlookRecipient;
  toRecipients?: OutlookRecipient[];
  ccRecipients?: OutlookRecipient[];
  bccRecipients?: OutlookRecipient[];
  body?: {
    contentType: "text" | "html";
    content: string;
  };
  parentFolderId?: string;
  conversationIndex?: string;
  internetMessageId?: string;
}

interface MessageDetail {
  success: boolean;
  data?: OutlookMessage;
  messageId?: string;
  error?: string;
}

const serverInfo: InternalMCPServerDefinitionType = {
  name: "outlook",
  version: "1.0.0",
  description: "Outlook tools for reading emails and managing email drafts.",
  authorization: {
    provider: "microsoft" as const,
    supported_use_cases: ["personal_actions"] as const,
    scope: "Mail.ReadWrite Mail.ReadWrite.Shared User.Read" as const,
  },
  icon: "OutlookLogo",
  documentationUrl: "https://docs.dust.tt/docs/outlook-tool-setup",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_messages",
    "Get messages from Outlook inbox. Supports search queries to filter messages.",
    {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter messages. Examples: "from:someone@example.com", "subject:meeting", "hasAttachments:true". Leave empty to get recent messages.'
        ),
      top: z
        .number()
        .optional()
        .describe(
          "Maximum number of messages to return (default: 10, max: 100)"
        ),
      skip: z
        .number()
        .optional()
        .describe("Number of messages to skip for pagination."),
      select: z
        .array(z.string())
        .optional()
        .describe("Fields to include in the response."),
    },
    async ({ search, top = 10, skip = 0, select }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      const params = new URLSearchParams();
      params.append("$top", Math.min(top, 100).toString());
      params.append("$skip", skip.toString());
      
      if (search) {
        params.append("$search", `"${search}"`);
      }
      
      if (select && select.length > 0) {
        params.append("$select", select.join(","));
      } else {
        params.append("$select", "id,conversationId,subject,bodyPreview,importance,receivedDateTime,sentDateTime,hasAttachments,isDraft,isRead,from,toRecipients,ccRecipients,parentFolderId");
      }

      const response = await fetchFromOutlook(
        `/me/messages?${params.toString()}`,
        accessToken,
        { method: "GET" }
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return makeMCPToolTextError(
          `Failed to get messages: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Messages fetched successfully",
        result: {
          messages: result.value || [],
          nextLink: result["@odata.nextLink"],
          totalCount: result["@odata.count"],
        },
      });
    }
  );

  server.tool(
    "get_drafts",
    "Get all draft emails from Outlook.",
    {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter drafts. Examples: "subject:meeting", "to:someone@example.com".'
        ),
      skip: z
        .number()
        .optional()
        .describe("Number of drafts to skip for pagination."),
    },
    async ({ search, skip = 0 }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      const params = new URLSearchParams();
      params.append("$filter", "isDraft eq true");
      params.append("$top", "50");
      params.append("$skip", skip.toString());
      
      if (search) {
        params.append("$search", `"${search}"`);
      }

      const response = await fetchFromOutlook(
        `/me/messages?${params.toString()}`,
        accessToken,
        { method: "GET" }
      );

      if (!response.ok) {
        return makeMCPToolTextError("Failed to get drafts");
      }

      const result = await response.json();

      // Get detailed information for each draft
      const draftDetails = await concurrentExecutor(
        result.value || [],
        async (draft: { id: string }) => {
          const draftResponse = await fetchFromOutlook(
            `/me/messages/${draft.id}`,
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

      return makeMCPToolJSONSuccess({
        message: "Drafts fetched successfully",
        result: {
          drafts: draftDetails.filter(Boolean),
          nextLink: result["@odata.nextLink"],
        },
      });
    }
  );

  server.tool(
    "create_draft",
    `Create a new email draft in Outlook.
- The draft will be saved in the user's Outlook account and can be reviewed and sent later.
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
        .enum(["text", "html"])
        .describe("The content type of the email (text or html)."),
      body: z.string().describe("The body of the email"),
      importance: z
        .enum(["low", "normal", "high"])
        .optional()
        .describe("The importance level of the email"),
    },
    async ({ to, cc, bcc, subject, contentType, body, importance = "normal" }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      // Create the email message object for Microsoft Graph API
      const message: any = {
        subject,
        importance,
        body: {
          contentType,
          content: body,
        },
        toRecipients: to.map(email => ({
          emailAddress: { address: email }
        })),
        isDraft: true,
      };

      if (cc && cc.length > 0) {
        message.ccRecipients = cc.map(email => ({
          emailAddress: { address: email }
        }));
      }

      if (bcc && bcc.length > 0) {
        message.bccRecipients = bcc.map(email => ({
          emailAddress: { address: email }
        }));
      }

      // Make the API call to create the draft in Outlook
      const response = await fetchFromOutlook(
        "/me/messages",
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        }
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return makeMCPToolTextError(`Failed to create draft: ${errorText}`);
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Draft created successfully",
        result: {
          messageId: result.id,
          conversationId: result.conversationId,
        },
      });
    }
  );

  server.tool(
    "delete_draft",
    "Delete a draft email from Outlook.",
    {
      messageId: z.string().describe("The ID of the draft to delete"),
      subject: z.string().describe("The subject of the draft to delete"),
      to: z.array(z.string()).describe("The email addresses of the recipients"),
    },
    async ({ messageId, subject, to }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      // Subject and to are required for user display/confirmation
      if (!subject || to.length === 0) {
        return makeMCPToolTextError("Subject and recipients are required for confirmation");
      }

      const response = await fetchFromOutlook(
        `/me/messages/${messageId}`,
        accessToken,
        { method: "DELETE" }
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
    "create_reply_draft",
    `Create a reply draft to an existing email in Outlook.
- The draft will be saved in the user's Outlook account and can be reviewed and sent later.
- The reply will be properly formatted with the original message quoted.
- The draft will include proper email headers and threading information.`,
    {
      messageId: z.string().describe("The ID of the message to reply to"),
      body: z.string().describe("The body of the reply email"),
      contentType: z
        .enum(["text", "html"])
        .optional()
        .describe(
          "The content type of the email (text or html). Defaults to html."
        ),
      replyAll: z
        .boolean()
        .optional()
        .describe("Whether to reply to all recipients. Defaults to false."),
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
      { messageId, body, contentType = "html", replyAll = false, to, cc, bcc },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      // Create the reply draft
      const endpoint = replyAll 
        ? `/me/messages/${messageId}/createReplyAll`
        : `/me/messages/${messageId}/createReply`;

      const replyMessage: any = {
        message: {
          body: {
            contentType,
            content: body,
          },
        },
      };

      // Add recipients if overriding
      if (to && to.length > 0) {
        replyMessage.message.toRecipients = to.map(email => ({
          emailAddress: { address: email }
        }));
      }

      if (cc && cc.length > 0) {
        replyMessage.message.ccRecipients = cc.map(email => ({
          emailAddress: { address: email }
        }));
      }

      if (bcc && bcc.length > 0) {
        replyMessage.message.bccRecipients = bcc.map(email => ({
          emailAddress: { address: email }
        }));
      }

      const response = await fetchFromOutlook(
        endpoint,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(replyMessage),
        }
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        if (response.status === 404) {
          return makeMCPToolTextError(`Message not found: ${messageId}`);
        }
        return makeMCPToolTextError(
          `Failed to create reply draft: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Reply draft created successfully",
        result: {
          messageId: result.id,
          conversationId: result.conversationId,
          originalMessageId: messageId,
          subject: result.subject,
        },
      });
    }
  );

  return server;
};

const fetchFromOutlook = async (
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> => {
  return fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });
};

const getErrorText = async (response: Response): Promise<string> => {
  try {
    const errorData = await response.json();
    return errorData.error?.message || errorData.error?.code || "Unknown error";
  } catch {
    return "Unknown error";
  }
};

export default createServer;