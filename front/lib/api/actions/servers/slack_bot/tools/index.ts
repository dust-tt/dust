import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  executeListPublicChannels,
  executeListUserGroups,
  executePostMessage,
  executeSearchUser,
  getSlackClient,
} from "@app/lib/actions/mcp_internal_actions/servers/slack/helpers";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SLACK_BOT_TOOLS_METADATA } from "@app/lib/api/actions/servers/slack_bot/metadata";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export function createSlackBotTools(
  auth: Authenticator,
  mcpServerId: string,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SLACK_BOT_TOOLS_METADATA> = {
    post_message: async ({ to, message, threadTs, fileId }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      if (!agentLoopContext?.runContext) {
        return new Err(new MCPError("Issue with agent context"));
      }

      try {
        return await executePostMessage(auth, agentLoopContext, {
          to,
          message,
          threadTs,
          fileId,
          accessToken,
        });
      } catch (error) {
        return new Err(
          new MCPError(`Error posting message: ${normalizeError(error)}`)
        );
      }
    },

    search_user: async ({ query, search_all }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      try {
        return await executeSearchUser(query, search_all ?? false, {
          accessToken,
          mcpServerId,
        });
      } catch (error) {
        return new Err(
          new MCPError(`Error searching user: ${normalizeError(error)}`)
        );
      }
    },

    list_user_groups: async (_params, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      try {
        return await executeListUserGroups({ accessToken });
      } catch (error) {
        return new Err(
          new MCPError(`Error listing user groups: ${normalizeError(error)}`)
        );
      }
    },

    list_public_channels: async ({ nameFilter }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      try {
        return await executeListPublicChannels(
          nameFilter,
          accessToken,
          mcpServerId
        );
      } catch (error) {
        return new Err(
          new MCPError(`Error listing channels: ${normalizeError(error)}`)
        );
      }
    },

    read_channel_history: async (
      { channel, limit = 20, cursor, oldest, latest },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }
      const slackClient = await getSlackClient(accessToken);

      try {
        const response = await slackClient.conversations.history({
          channel: channel,
          limit: Math.min(limit, 200),
          cursor: cursor,
          oldest: oldest,
          latest: latest,
        });

        const hasMore = !!response.has_more;
        const nextCursor = response.response_metadata?.next_cursor;

        return new Ok([
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                messages: response.messages,
                has_more: hasMore,
                next_cursor: nextCursor,
                pagination_info: {
                  current_page_size: response.messages?.length ?? 0,
                  has_more_pages: hasMore,
                  next_cursor_for_pagination: nextCursor,
                },
              },
              null,
              2
            ),
          },
        ]);
      } catch (error) {
        return new Err(
          new MCPError(
            `Error reading channel history: ${normalizeError(error)}`
          )
        );
      }
    },

    read_thread_messages: async (
      { channel, threadTs, limit = 20, cursor, oldest, latest },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      const slackClient = await getSlackClient(accessToken);

      try {
        const response = await slackClient.conversations.replies({
          channel: channel,
          ts: threadTs,
          limit: Math.min(limit, 200), // Slack API max is 200
          cursor: cursor,
          oldest: oldest,
          latest: latest,
        });

        const hasMore = !!response.has_more;
        const nextCursor = response.response_metadata?.next_cursor;

        // First message is always the parent message
        const parentMessage = response.messages?.[0];
        const threadReplies = response.messages?.slice(1) ?? [];

        return new Ok([
          {
            type: "text" as const,
            text: `Retrieved thread with ${response.messages?.length} total messages (1 parent + ${threadReplies.length} replies)${hasMore ? ". More replies available." : ""}`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                parent_message: parentMessage,
                thread_replies: threadReplies,
                total_messages: response.messages?.length ?? 0,
                has_more: hasMore,
                next_cursor: nextCursor,
                pagination_info: {
                  current_page_size: response.messages?.length ?? 0,
                  replies_in_this_page: threadReplies.length,
                  has_more_pages: hasMore,
                  next_cursor_for_pagination: nextCursor,
                },
              },
              null,
              2
            ),
          },
        ]);
      } catch (error) {
        return new Err(
          new MCPError(
            `Error reading thread messages: ${normalizeError(error)}`
          )
        );
      }
    },

    add_reaction: async ({ channel, timestamp, name }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      const slackClient = await getSlackClient(accessToken);

      try {
        const response = await slackClient.reactions.add({
          channel,
          timestamp,
          name,
        });

        if (!response.ok) {
          return new Err(
            new MCPError(`Error adding reaction: ${response.error}`)
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Successfully added ${name} reaction to message`,
          },
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ]);
      } catch (error) {
        return new Err(
          new MCPError(`Error adding reaction: ${normalizeError(error)}`)
        );
      }
    },

    remove_reaction: async ({ channel, timestamp, name }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      const slackClient = await getSlackClient(accessToken);

      try {
        const response = await slackClient.reactions.remove({
          channel,
          timestamp,
          name,
        });

        if (!response.ok) {
          return new Err(
            new MCPError(`Error removing reaction: ${response.error}`)
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Successfully removed ${name} reaction from message`,
          },
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ]);
      } catch (error) {
        return new Err(
          new MCPError(`Error removing reaction: ${normalizeError(error)}`)
        );
      }
    },
  };

  return buildTools(SLACK_BOT_TOOLS_METADATA, handlers);
}
