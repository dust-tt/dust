import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  executeGetUser,
  executeListPublicChannels,
  executeListUsers,
  executePostMessage,
  getSlackClient,
} from "@app/lib/actions/mcp_internal_actions/servers/slack/slack_api_helper";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { normalizeError } from "@app/types";

const createServer = async (
  auth: Authenticator,
  mcpServerId: string,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> => {
  const server = makeInternalMCPServer("slack_bot");

  server.tool(
    "post_message",
    "Post a message to a Slack channel. The slack bot must be added to the channel before it can post messages. Direct messages are not supported.",
    {
      to: z
        .string()
        .describe(
          "The channel to post the message to. Accepted values are the channel name or the channel id."
        ),
      message: z
        .string()
        .describe(
          "The message to post, must follow the Slack message formatting rules."
        ),
      threadTs: z
        .string()
        .optional()
        .describe(
          "The thread ts of the message to reply to. If you don't provide a thread ts, the message will be posted as a top-level message."
        ),
    },
    async ({ to, message, threadTs }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        throw new Error("Access token not found");
      }

      if (!agentLoopContext?.runContext) {
        throw new Error("Issue with agent context");
      }

      try {
        return await executePostMessage(
          to,
          message,
          threadTs,
          accessToken,
          agentLoopContext,
          auth
        );
      } catch (error) {
        return makeMCPToolTextError(
          `Error posting message: ${normalizeError(error)}`
        );
      }
    }
  );

  server.tool(
    "list_users",
    "List all users in the workspace",
    {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the user to filter by (optional)"),
    },
    async ({ nameFilter }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        throw new Error("Access token not found");
      }

      try {
        return await executeListUsers(nameFilter, accessToken);
      } catch (error) {
        return makeMCPToolTextError(
          `Error listing users: ${normalizeError(error)}`
        );
      }
    }
  );

  server.tool(
    "get_user",
    "Get user information given a Slack user ID. Use this to retrieve details about a user when you have their user ID.",
    {
      userId: z
        .string()
        .describe("The Slack user ID to look up (for example: U0123456789)."),
    },
    async ({ userId }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        throw new Error("Access token not found");
      }

      try {
        return await executeGetUser(userId, accessToken);
      } catch (error) {
        return makeMCPToolTextError(
          `Error retrieving user info: ${normalizeError(error)}`
        );
      }
    }
  );

  server.tool(
    "list_public_channels",
    "List all public channels in the workspace",
    {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the channel to filter by (optional)"),
    },
    async ({ nameFilter }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        throw new Error("Access token not found");
      }

      try {
        return await executeListPublicChannels(
          nameFilter,
          accessToken,
          mcpServerId
        );
      } catch (error) {
        return makeMCPToolTextError(
          `Error listing channels: ${normalizeError(error)}`
        );
      }
    }
  );

  server.tool(
    "read_channel_history",
    "Read messages from a specific channel with pagination support. The slack bot must be added to the channel before it can read messages.",
    {
      channel: z.string().describe("Channel name or ID"),
      limit: z
        .number()
        .optional()
        .describe("Number of messages to retrieve (default: 20, max: 200)"),
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor from previous call to get next page of messages"
        ),
      oldest: z
        .string()
        .optional()
        .describe("Only messages after this timestamp (Unix timestamp)"),
      latest: z
        .string()
        .optional()
        .describe("Only messages before this timestamp (Unix timestamp)"),
    },
    async ({ channel, limit = 20, cursor, oldest, latest }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        throw new Error("Access token not found");
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

        return makeMCPToolJSONSuccess({
          result: {
            messages: response.messages,
            has_more: hasMore,
            next_cursor: nextCursor,
            pagination_info: {
              current_page_size: response.messages?.length || 0,
              has_more_pages: hasMore,
              next_cursor_for_pagination: nextCursor,
            },
          },
        });
      } catch (error) {
        return makeMCPToolTextError(
          `Error reading channel history: ${normalizeError(error)}`
        );
      }
    }
  );

  server.tool(
    "read_thread_messages",
    "Read all messages in a specific thread with pagination support",
    {
      channel: z.string().describe("Channel name or ID"),
      threadTs: z
        .string()
        .describe("Thread timestamp (ts of the parent message)"),
      limit: z
        .number()
        .optional()
        .describe("Number of messages to retrieve (default: 20, max: 200)"),
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor from previous call to get next page of thread messages"
        ),
      oldest: z
        .string()
        .optional()
        .describe("Only messages after this timestamp (Unix timestamp)"),
      latest: z
        .string()
        .optional()
        .describe("Only messages before this timestamp (Unix timestamp)"),
    },
    async (
      { channel, threadTs, limit = 20, cursor, oldest, latest },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        throw new Error("Access token not found");
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
        const threadReplies = response.messages?.slice(1) || [];

        return makeMCPToolJSONSuccess({
          message: `Retrieved thread with ${response.messages?.length} total messages (1 parent + ${threadReplies.length} replies)${hasMore ? ". More replies available." : ""}`,
          result: {
            parent_message: parentMessage,
            thread_replies: threadReplies,
            total_messages: response.messages?.length || 0,
            has_more: hasMore,
            next_cursor: nextCursor,
            pagination_info: {
              current_page_size: response.messages?.length || 0,
              replies_in_this_page: threadReplies.length,
              has_more_pages: hasMore,
              next_cursor_for_pagination: nextCursor,
            },
          },
        });
      } catch (error) {
        return makeMCPToolTextError(
          `Error reading thread messages: ${normalizeError(error)}`
        );
      }
    }
  );

  return server;
};

export default createServer;
