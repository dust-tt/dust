import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { getGraphClient } from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getConversationRoute } from "@app/lib/utils/router";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("microsoft_teams");

  server.tool(
    "search_messages_content",
    "Search for messages contentin Microsoft Teams chats and channels. Returns the results in relevance order.",
    {
      query: z
        .string()
        .describe("Search query to find relevant messages in Teams."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async ({ query }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const endpoint = `/search/query`;

          const requestBody = {
            requests: [
              {
                entityTypes: ["chatMessage"],
                query: {
                  queryString: query,
                },
                enableTopResults: true,
              },
            ],
          };

          const response = await client.api(endpoint).post(requestBody);

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value[0].hitsContainers, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to search Teams messages"
            )
          );
        }
      }
    )
  );

  server.tool(
    "list_teams",
    "List all Teams that the authenticated user has joined. Returns team details including name, description, and team ID.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async (_params, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const response = await client.api("/me/joinedTeams").get();

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to list teams")
          );
        }
      }
    )
  );

  server.tool(
    "list_users",
    "List all users in the organization. Returns user details including display name, email, and user ID.",
    {
      limit: z
        .number()
        .optional()
        .default(25)
        .describe("Maximum number of users to return (default: 25, max: 999)."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async ({ limit }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const maxLimit = Math.min(limit || 25, 999);
          const response = await client
            .api("/users")
            .top(maxLimit)
            .select("id,displayName,mail,userPrincipalName")
            .get();

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to list users")
          );
        }
      }
    )
  );

  server.tool(
    "list_channels",
    "List all channels in a specific team. Returns channel details including name, description, and channel ID.",
    {
      teamId: z
        .string()
        .describe(
          "The ID of the team to list channels from. Use list_teams to get team IDs."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async ({ teamId }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const response = await client.api(`/teams/${teamId}/channels`).get();

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to list public channels"
            )
          );
        }
      }
    )
  );

  server.tool(
    "list_chats",
    "List all chats (one-on-one or group chats) for the authenticated user. Returns chat details including chat ID, topic, and participants. Can be filtered by chat type.",
    {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of chats to return (default: 50, max: 50)."),
      chatType: z
        .enum(["oneOnOne", "group", "meeting"])
        .optional()
        .describe(
          "Filter chats by type: 'oneOnOne' for direct messages, 'group' for group chats, 'meeting' for meeting chats."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async ({ limit, chatType }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const maxLimit = Math.min(limit || 50, 50);
          let apiCall = client
            .api("/me/chats")
            .orderby("lastMessagePreview/createdDateTime desc")
            .top(maxLimit)
            .expand("members");

          // Add filter if chatType is specified
          if (chatType) {
            apiCall = apiCall.filter(`chatType eq '${chatType}'`);
          }

          const response = await apiCall.get();

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to list chats")
          );
        }
      }
    )
  );

  server.tool(
    "list_messages",
    "List all messages (and their replies) in a specific channel. Returns thread messages with their replies.",
    {
      teamId: z.string().describe("The ID of the team containing the channel."),
      channelId: z
        .string()
        .describe("The ID of the channel to list threads from."),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe(
          "Maximum number of messages to return (default: 50, max: 50)."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async ({ teamId, channelId, limit }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const maxLimit = Math.min(limit || 50, 50);
          const response = await client
            .api(`/teams/${teamId}/channels/${channelId}/messages`)
            .top(maxLimit)
            .get();

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to list threads"
            )
          );
        }
      }
    )
  );

  server.tool(
    "post_message",
    "Post a message to a Teams channel, chat, or as a reply in a thread. Can send messages to channels, direct chats, or as threaded replies.",
    {
      messageContent: z
        .string()
        .describe(
          "The content of the message to post (supports HTML formatting)."
        ),
      targetType: z
        .enum(["channel", "chat"])
        .describe(
          "The type of target to post to: 'channel' for team channels, 'chat' for direct/group chats."
        ),
      teamId: z
        .string()
        .optional()
        .describe(
          "The ID of the team (required when targetType is 'channel')."
        ),
      channelId: z
        .string()
        .optional()
        .describe(
          "The ID of the channel (required when targetType is 'channel')."
        ),
      chatId: z
        .string()
        .optional()
        .describe("The ID of the chat (required when targetType is 'chat')."),
      parentMessageId: z
        .string()
        .optional()
        .describe(
          "The ID of the parent message to reply to (optional, creates a threaded reply). Only supported for channels."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async (
        {
          messageContent,
          targetType,
          teamId,
          channelId,
          chatId,
          parentMessageId,
        },
        { authInfo }
      ) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          let endpoint: string;

          // Validate required parameters based on target type
          if (targetType === "channel") {
            if (!teamId || !channelId) {
              return new Err(
                new MCPError(
                  "teamId and channelId are required when targetType is 'channel'"
                )
              );
            }
            if (parentMessageId) {
              // Reply to a thread in a channel
              endpoint = `/teams/${teamId}/channels/${channelId}/messages/${parentMessageId}/replies`;
            } else {
              // New message in a channel
              endpoint = `/teams/${teamId}/channels/${channelId}/messages`;
            }
          } else if (targetType === "chat") {
            if (!chatId) {
              return new Err(
                new MCPError("chatId is required when targetType is 'chat'")
              );
            }
            // New message in a chat (chats don't support threaded replies via parentMessageId)
            endpoint = `/chats/${chatId}/messages`;
          } else {
            return new Err(
              new MCPError("Invalid targetType. Must be 'channel' or 'chat'.")
            );
          }

          // Add footer with link to Dust conversation if agent context is available
          let finalContent = messageContent;
          if (agentLoopContext?.runContext?.agentConfiguration) {
            const agentUrl = getConversationRoute(
              auth.getNonNullableWorkspace().sId,
              "new",
              `agentDetails=${agentLoopContext.runContext.agentConfiguration.sId}`,
              config.getClientFacingUrl()
            );
            const agentName =
              agentLoopContext.runContext.agentConfiguration.name;
            const footerMessage = `<em>Sent via <a href="${agentUrl}">${agentName} Agent</a> on Dust</em>`;
            finalContent = `${messageContent}<br/><br/>${footerMessage}`;
          }

          const requestBody = {
            body: {
              contentType: "html",
              content: finalContent,
            },
          };

          const response = await client.api(endpoint).post(requestBody);

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  messageId: response.id,
                  createdDateTime: response.createdDateTime,
                  webUrl: response.webUrl,
                },
                null,
                2
              ),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to post message"
            )
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
