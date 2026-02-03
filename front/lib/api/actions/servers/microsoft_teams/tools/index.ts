import sanitizeHtml from "sanitize-html";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  TeamsChannel,
  TeamsChat,
  TeamsMessage,
  TeamsUser,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import { getGraphClient } from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { MICROSOFT_TEAMS_TOOLS_METADATA } from "@app/lib/api/actions/servers/microsoft_teams/metadata";
import {
  renderChannels,
  renderChats,
  renderUsers,
} from "@app/lib/api/actions/servers/microsoft_teams/microsoft_teams_rendering";
import config from "@app/lib/api/config";
import { getConversationRoute } from "@app/lib/utils/router";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const MAX_NUMBER_OF_MESSAGES = 200;

const handlers: ToolHandlers<typeof MICROSOFT_TEAMS_TOOLS_METADATA> = {
  search_messages_content: async ({ query }, extra) => {
    const client = await getGraphClient(extra.authInfo);
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
  },

  list_teams: async (_params, extra) => {
    const client = await getGraphClient(extra.authInfo);
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
  },

  list_users: async ({ nameFilter, limit }, extra) => {
    const client = await getGraphClient(extra.authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const maxLimit = Math.min(limit || 25, 25);
      let apiCall = client
        .api("/users")
        .top(maxLimit)
        .select("id,displayName,mail,userPrincipalName");

      // Add filter if nameFilter is specified
      if (nameFilter) {
        apiCall = apiCall.filter(
          `startswith(displayName,'${nameFilter}') or startswith(userPrincipalName,'${nameFilter}')`
        );
      }

      const response = await apiCall.get();

      const users: TeamsUser[] = (response.value as TeamsUser[]) ?? [];

      return new Ok([
        {
          type: "text" as const,
          text: renderUsers(users),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to list users")
      );
    }
  },

  list_channels: async ({ teamId, nameFilter }, extra) => {
    const client = await getGraphClient(extra.authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      let apiCall = client.api(`/teams/${teamId}/channels`);

      // Add filter if nameFilter is specified
      if (nameFilter) {
        apiCall = apiCall.filter(`startswith(displayName,'${nameFilter}')`);
      }

      const response = await apiCall.get();

      const channels: TeamsChannel[] = (response.value as TeamsChannel[]) ?? [];

      return new Ok([
        {
          type: "text" as const,
          text: renderChannels(channels),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to list public channels"
        )
      );
    }
  },

  list_chats: async ({ limit, chatType, nameFilter }, extra) => {
    const client = await getGraphClient(extra.authInfo);
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
        .top(maxLimit);

      // Build filter conditions
      const filterConditions: string[] = [];
      if (chatType) {
        filterConditions.push(`chatType eq '${chatType}'`);
      }
      if (nameFilter) {
        filterConditions.push(`startswith(topic,'${nameFilter}')`);
      }

      // Apply filter if any conditions exist
      if (filterConditions.length > 0) {
        apiCall = apiCall.filter(filterConditions.join(" and "));
      }

      const response = await apiCall.get();

      const chats: TeamsChat[] = (response.value as TeamsChat[]) ?? [];

      return new Ok([
        {
          type: "text" as const,
          text: renderChats(chats),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to list chats")
      );
    }
  },

  list_messages: async ({ teamId, channelId, fromDate, toDate }, extra) => {
    const client = await getGraphClient(extra.authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const allMessages: TeamsMessage[] = [];
      let nextLink: string | undefined = undefined;
      const fromDateTime = fromDate ? new Date(fromDate) : null;
      const toDateTime = toDate ? new Date(toDate) : new Date();

      // Filter function to check if message is in date range
      const isMessageInDateRange = (message: TeamsMessage): boolean => {
        const messageDate = new Date(message.lastModifiedDateTime);
        const afterFromDate = !fromDateTime || messageDate >= fromDateTime;
        const beforeToDate = messageDate <= toDateTime;
        return afterFromDate && beforeToDate;
      };

      // Process messages and update shouldContinue flag
      const processMessages = (messages: TeamsMessage[]): boolean => {
        const messagesInDateRange = messages.filter(isMessageInDateRange);
        allMessages.push(...messagesInDateRange);
        return (
          // if the last message in the current page is in the date range, we should continue
          messagesInDateRange
            .map((message) => message.id)
            .includes(messages[messages.length - 1].id) &&
          allMessages.length < MAX_NUMBER_OF_MESSAGES
        );
      };

      // First page
      let response = await client
        .api(`/teams/${teamId}/channels/${channelId}/messages`)
        .top(50)
        .get();

      let shouldContinue = processMessages(response.value);

      // Follow pagination links until no more pages or date threshold reached
      nextLink = response["@odata.nextLink"];
      while (nextLink && shouldContinue) {
        response = await client.api(nextLink).get();
        shouldContinue = processMessages(response.value);
        nextLink = response["@odata.nextLink"];
      }

      const limitedMessages = allMessages.slice(0, MAX_NUMBER_OF_MESSAGES);

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(limitedMessages, null, 2),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to list threads")
      );
    }
  },

  post_message: async (
    {
      messageContent,
      targetType,
      teamId,
      channelId,
      chatId,
      userIds,
      parentMessageId,
    },
    extra
  ) => {
    const client = await getGraphClient(extra.authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    try {
      let endpoint: string = "";
      let finalChatId = chatId;

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
        const meResponse = await client.api("/me").select("id").get();
        const currentUserId = meResponse.id;
        // Validate that either chatId or userIds is provided, but not both
        if (chatId && userIds && userIds.length > 0) {
          return new Err(
            new MCPError(
              "Cannot provide both chatId and userIds. Use chatId for existing chats, or userIds to create/find a chat."
            )
          );
        }
        if (!chatId && (!userIds || userIds.length === 0)) {
          userIds = [currentUserId]; // default to self-chat
        }

        // If userIds is provided, create or get existing chat
        if (userIds && userIds.length > 0) {
          try {
            if (userIds.length === 1 && userIds[0] === currentUserId) {
              // Send a message to the self-chat
              // Really mysterious url found here: https://stackoverflow.com/questions/73936648/send-message-to-self-chat-in-microsoft-teams-using-graph-api
              endpoint = "/me/chats/48:notes/messages";
            } else {
              const allUserIds = Array.from(
                new Set([currentUserId, ...userIds])
              ).sort();
              const chatType = userIds.length === 1 ? "oneOnOne" : "group";

              // First, try to find an existing chat with these exact users
              // Fetch pages of chats using pagination, checking each page for a match
              let existingChat = null;
              let nextLink: string | undefined = undefined;

              do {
                const chatsResponse: any = nextLink
                  ? await client.api(nextLink).get()
                  : await client
                      .api("/me/chats")
                      .filter(`chatType eq '${chatType}'`)
                      .expand("members")
                      .get();

                // Check chats in the current page
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                for (const chat of chatsResponse.value || []) {
                  const chatMemberIds = chat.members
                    .map((member: { userId: string }) => member.userId)
                    .sort();

                  // Check if the chat has the exact same members
                  if (
                    chatMemberIds.length === allUserIds.length &&
                    chatMemberIds.every(
                      (id: string, index: number) => id === allUserIds[index]
                    )
                  ) {
                    existingChat = chat;
                    break;
                  }
                }

                // Stop pagination if we found a match
                if (existingChat) {
                  break;
                }

                nextLink = chatsResponse["@odata.nextLink"];
              } while (nextLink);

              if (existingChat) {
                // Use the existing chat
                finalChatId = existingChat.id;
              } else {
                // Create a new chat with the specified users
                const members = allUserIds.map((id) => ({
                  "@odata.type": "#microsoft.graph.aadUserConversationMember",
                  roles: ["owner"],
                  "user@odata.bind": `https://graph.microsoft.com/v1.0/users/${id}`,
                }));

                const chatResponse = await client.api("/chats").post({
                  chatType,
                  members,
                });

                finalChatId = chatResponse.id;
              }
            }
          } catch (err) {
            return new Err(
              new MCPError(
                `Failed to create or find chat with users: ${normalizeError(err).message}`
              )
            );
          }
        }

        endpoint = endpoint || `/chats/${finalChatId}/messages`;
      } else {
        return new Err(
          new MCPError("Invalid targetType. Must be 'channel' or 'chat'.")
        );
      }

      // Add footer with link to Dust conversation if agent context is available
      let finalContent = messageContent;
      if (extra.agentLoopContext?.runContext?.agentConfiguration) {
        const agentUrl = getConversationRoute(
          auth.getNonNullableWorkspace().sId,
          "new",
          `agentDetails=${extra.agentLoopContext.runContext.agentConfiguration.sId}`,
          config.getAppUrl()
        );
        const agentName =
          extra.agentLoopContext.runContext.agentConfiguration.name;
        const footerMessage = `<em>Sent via <a href="${agentUrl}">${agentName} Agent</a> on Dust</em>`;
        finalContent = `${messageContent}<br/><br/>${footerMessage}`;
      }

      const requestBody = {
        body: {
          contentType: "html",
          content: sanitizeHtml(finalContent),
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
        new MCPError(normalizeError(err).message || "Failed to post message")
      );
    }
  },
};

export const TOOLS = buildTools(MICROSOFT_TEAMS_TOOLS_METADATA, handlers);
