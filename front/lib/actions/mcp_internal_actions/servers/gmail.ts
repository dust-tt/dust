import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assert } from "console";
import { z } from "zod";

import { makeMCPToolPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_internal_actions/authentication";
import { getConnectionForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { GMAIL_SCOPE_TYPES } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "gmail",
  version: "1.0.0",
  description: "Gmail tools for managing email drafts.",
  authorization: {
    provider: "gmail" as const,
    use_case: "personal_actions" as const,
    scope: GMAIL_SCOPE_TYPES.EMAIL,
  },
  icon: "GmailLogo",
  documentationUrl: "https://docs.dust.tt/docs/gmail-tool-setup",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
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
    },
    async ({ q }) => {
      const connection = await getConnectionForInternalMCPServer(auth, {
        mcpServerId,
        connectionType: "personal",
      });

      const accessToken = connection?.access_token;

      if (!accessToken) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }

      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts?q=" +
          encodeURIComponent(q ?? ""),
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
        result: drafts,
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
    async ({ to, cc, bcc, subject, contentType, body }) => {
      const connection = await getConnectionForInternalMCPServer(auth, {
        mcpServerId,
        connectionType: "personal",
      });

      const accessToken = connection?.access_token;

      if (!accessToken) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }

      // Create the email message with proper headers and content.
      const message = [
        `To: ${to.join(", ")}`,
        cc?.length ? `Cc: ${cc.join(", ")}` : "",
        bcc?.length ? `Bcc: ${bcc.join(", ")}` : "",
        `Subject: ${subject}`,
        "Content-Type: " + contentType,
        "MIME-Version: 1.0",
        "",
        body,
      ]
        .filter(Boolean)
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
        console.log(response, await response.json());
        return makeMCPToolTextError("Failed to create draft");
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
    async ({ draftId, subject, to }) => {
      const connection = await getConnectionForInternalMCPServer(auth, {
        mcpServerId,
        connectionType: "personal",
      });

      const accessToken = connection?.access_token;

      if (!accessToken) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }

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

  return server;
};

export default createServer;
