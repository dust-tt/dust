import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebClient } from "@slack/web-api";
import type { Match } from "@slack/web-api/dist/response/SearchMessagesResponse";
import type { Member } from "@slack/web-api/dist/response/UsersListResponse";
import { uniqBy } from "lodash";
import slackifyMarkdown from "slackify-markdown";
import { z } from "zod";

import type {
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderRelativeTimeFrameForToolOutput } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  actionRefsOffset,
  SLACK_SEARCH_ACTION_NUM_RESULTS,
} from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { removeDiacritics } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { TimeFrame } from "@app/types";
import { parseTimeFrame, stripNullBytes, timeFrameFromNow } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "slack",
  version: "1.0.0",
  description: "Slack tools for searching and posting messages.",
  authorization: {
    provider: "slack" as const,
    supported_use_cases: ["personal_actions"] as const,
    // Use a magic prefix to split the scopes into user and bot scopes which is a slack specific thing.
    scope:
      "user_scope:chat:write user_scope:search:read user_scope:users:read user_scope:channels:read" as const,
  },
  icon: "SlackLogo",
  documentationUrl: "https://docs.dust.tt/docs/slack-tool-setup",
};

const getSlackClient = async (accessToken?: string) => {
  if (!accessToken) {
    throw new Error("No access token provided");
  }

  return new WebClient(accessToken, {
    timeout: 10000,
    rejectRateLimitedCalls: false,
    retryConfig: {
      retries: 1,
      factor: 1,
    },
  });
};

function makeQueryResource(
  keywords: string[],
  relativeTimeFrame: TimeFrame | null,
  channels?: string[],
  usersFrom?: string[],
  usersTo?: string[],
  usersMentioned?: string[]
): SearchQueryResourceType {
  const timeFrameAsString =
    renderRelativeTimeFrameForToolOutput(relativeTimeFrame);
  let text = `Searching ${timeFrameAsString}`;
  if (keywords.length > 0) {
    text += ` with keywords: ${keywords.join(", ")}`;
  }
  if (channels && channels.length > 0) {
    text += ` in channels: ${channels.join(", ")}`;
  }
  if (usersFrom && usersFrom.length > 0) {
    text += ` from users: ${usersFrom.join(", ")}`;
  }
  if (usersTo && usersTo.length > 0) {
    text += ` to users: ${usersTo.join(", ")}`;
  }
  if (usersMentioned && usersMentioned.length > 0) {
    text += ` mentioning users: ${usersMentioned.join(", ")}`;
  }

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text,
    uri: "",
  };
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo, {
    instructions:
      "When posting a message on slack, you MUST use slack-flavored markdown to format the message." +
      "IMPORTANT: if you want to mention a user, you must use <@USER_ID> where USER_ID is the id of the user you want to mention.\n" +
      "If you want to reference a channel, you must use <#CHANNEL_ID> where CHANNEL_ID is the id of the channel you want to reference.\n" +
      "NEVER use the channel name or the user name directly in a message as it will not be parsed correctly and appear as plain text.",
  });

  server.tool(
    "search_messages",
    "Search messages accross all channels and dms for the current user",
    {
      keywords: z
        .string()
        .array()
        .min(1)
        .max(3)
        .describe(
          "Between 1 and 3 keywords to retrieve relevant messages " +
            "based on the user request and conversation context."
        ),
      channels: z
        .string()
        .array()
        .optional()
        .describe("Narrow the search to a specific channels names (optional)"),
      usersFrom: z
        .string()
        .array()
        .optional()
        .describe(
          "Narrow the search to messages wrote by specific users ids (optional)"
        ),
      usersTo: z
        .string()
        .array()
        .optional()
        .describe(
          "Narrow the search to direct messages sent to specific users ids (optional)"
        ),
      usersMentioned: z
        .string()
        .array()
        .optional()
        .describe(
          "Narrow the search to messages mentioning specific users ids (optional)"
        ),
      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .describe(
          "The time frame (relative to LOCAL_TIME) to restrict the search based" +
            " on the user request and past conversation context." +
            " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
            " where {k} is a number. Be strict, do not invent invalid values."
        ),
    },
    async (
      {
        keywords,
        usersFrom,
        usersTo,
        usersMentioned,
        relativeTimeFrame,
        channels,
      },
      { authInfo }
    ) => {
      if (!agentLoopContext?.runContext) {
        throw new Error("Unreachable: missing agentLoopRunContext.");
      }

      const accessToken = authInfo?.token;
      const slackClient = await getSlackClient(accessToken);

      const timeFrame = parseTimeFrame(relativeTimeFrame);

      try {
        // Search in slack only support AND queries which can easily return 0 hits.
        // To avoid this, we'll simulate an OR query by searching for each keyword separately.
        // Then we will aggregate the results.
        const results: Match[][] = await concurrentExecutor(
          keywords,
          async (keyword) => {
            let query = keyword;

            if (timeFrame) {
              const timestampInMs = timeFrameFromNow(timeFrame);
              const date = new Date(timestampInMs);
              query = `${query} after:${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
            }

            if (channels && channels.length > 0) {
              query = `${query} ${channels
                .map((channel) =>
                  channel.charAt(0) === "#" ? `in:${channel}` : `in:#${channel}`
                )
                .join(" ")}`;
            }

            if (usersFrom && usersFrom.length > 0) {
              query = `${query} ${usersFrom.map((user) => `from:${user}`).join(" ")}`;
            }

            if (usersTo && usersTo.length > 0) {
              query = `${query} ${usersTo.map((user) => `to:${user}`).join(" ")}`;
            }

            if (usersMentioned && usersMentioned.length > 0) {
              query = `${query} ${usersMentioned.map((user) => `${user}`).join(" ")}`;
            }

            const messages = await slackClient.search.messages({
              query,
              sort: "score",
              sort_dir: "desc",
              highlight: false,
              count: SLACK_SEARCH_ACTION_NUM_RESULTS,
              page: 1,
            });

            if (!messages.ok) {
              throw new Error(messages.error);
            }

            return messages.messages?.matches ?? [];
          },
          { concurrency: 3 }
        );

        // Flatten the results, order by score descending.
        const rawMatches = results
          .flat()
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

        // Filter out matches that don't have a text.
        const matchesWithText = rawMatches.filter((match) => !!match.text);

        // Deduplicate matches by their iid.
        const deduplicatedMatches = uniqBy(matchesWithText, "iid");

        // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS matches.
        const matches = deduplicatedMatches.slice(
          0,
          SLACK_SEARCH_ACTION_NUM_RESULTS
        );

        if (matches.length === 0) {
          return {
            isError: false,
            content: [
              {
                type: "text" as const,
                text: `No messages found.`,
              },
              {
                type: "resource" as const,
                resource: makeQueryResource(
                  keywords,
                  timeFrame,
                  channels,
                  usersFrom,
                  usersTo,
                  usersMentioned
                ),
              },
            ],
          };
        } else {
          const refsOffset = actionRefsOffset({
            agentConfiguration: agentLoopContext.runContext.agentConfiguration,
            stepActionIndex: agentLoopContext.runContext.stepActionIndex,
            stepActions: agentLoopContext.runContext.stepActions,
            refsOffset: agentLoopContext.runContext.citationsRefsOffset,
          });

          const refs = getRefs().slice(
            refsOffset,
            refsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
          );

          const results: SearchResultResourceType[] = matches.map((match) => {
            return {
              mimeType:
                INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
              uri: match.permalink ?? "",
              text: `#${match.channel?.name ?? "Unknown"}, ${match.text ?? ""}`,

              id: match.ts ?? "",
              source: {
                provider: "slack",
                name: "Slack",
              },
              tags: [],
              ref: refs.shift() as string,
              chunks: [stripNullBytes(match.text ?? "")],
            };
          });

          return {
            isError: false,
            content: [
              ...results.map((result) => ({
                type: "resource" as const,
                resource: result,
              })),
              {
                type: "resource" as const,
                resource: makeQueryResource(
                  keywords,
                  timeFrame,
                  channels,
                  usersFrom,
                  usersTo,
                  usersMentioned
                ),
              },
            ],
          };
        }
      } catch (error) {
        return makeMCPToolTextError(`Error searching messages: ${error}`);
      }
    }
  );

  server.tool(
    "post_message",
    "Post a message to a channel or a direct message",
    {
      to: z
        .string()
        .describe(
          "The channel or user to post the message to. Accepted values are the channel name, the channel id or the user id. If you need to find the user id, you can use the `list_users` tool. " +
            "Messages sent to a user will be sent as a direct message."
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
          "The thread ts of the message to reply to. If you need to find the thread ts, you can use the `search_messages` tool, the thread ts is the id of the message you want to reply to. If you don't provide a thread ts, the message will be posted as a top-level message."
        ),
    },
    async ({ to, message, threadTs }, { authInfo }) => {
      const accessToken = authInfo?.token;
      const slackClient = await getSlackClient(accessToken);

      const originalMessage = message;

      if (!agentLoopContext?.runContext) {
        throw new Error("Unreachable: missing agentLoopRunContext.");
      }

      const agentUrl = `${config.getClientFacingUrl()}/w/${auth.getNonNullableWorkspace().sId}/assistant/new?assistantDetails=${agentLoopContext.runContext.agentConfiguration.sId}`;
      message = `${slackifyMarkdown(originalMessage)}\n_Sent via <${agentUrl}|${agentLoopContext.runContext.agentConfiguration.name} Agent> on Dust_`;

      const response = await slackClient.chat.postMessage({
        channel: to,
        text: message,
        mrkdwn: true,
        thread_ts: threadTs,
      });

      if (!response.ok) {
        return makeMCPToolTextError(`Error posting message: ${response.error}`);
      }

      return makeMCPToolJSONSuccess({
        message: `Message posted to ${to}`,
        result: response,
      });
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
      const slackClient = await getSlackClient(accessToken);

      const users: Member[] = [];

      let cursor: string | undefined = undefined;
      do {
        const response = await slackClient.users.list({
          cursor,
          limit: 100,
        });
        if (!response.ok) {
          return makeMCPToolTextError(`Error listing users: ${response.error}`);
        }
        users.push(
          ...(response.members ?? []).filter((member) => !member.is_bot)
        );
        cursor = response.response_metadata?.next_cursor;

        if (nameFilter) {
          const normalizedNameFilter = removeDiacritics(
            nameFilter.toLowerCase()
          );
          const filteredUsers = users.filter(
            (user) =>
              removeDiacritics(user.name?.toLowerCase() ?? "").includes(
                normalizedNameFilter
              ) ||
              removeDiacritics(user.real_name?.toLowerCase() ?? "").includes(
                normalizedNameFilter
              )
          );

          // Early return if we found a user
          if (filteredUsers.length > 0) {
            return makeMCPToolJSONSuccess({
              message: `The workspace has ${filteredUsers.length} users containing "${nameFilter}"`,
              result: filteredUsers,
            });
          }
        }
      } while (cursor);

      if (nameFilter) {
        return makeMCPToolJSONSuccess({
          message: `The workspace has ${users.length} users but none containing "${nameFilter}"`,
          result: users,
        });
      }

      return makeMCPToolJSONSuccess({
        message: `The workspace has ${users.length} users`,
        result: users,
      });
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
      const slackClient = await getSlackClient(accessToken);

      const channels: any[] = [];

      let cursor: string | undefined = undefined;
      do {
        const response = await slackClient.conversations.list({
          cursor,
          limit: 100,
          types: "public_channel",
        });
        if (!response.ok) {
          return makeMCPToolTextError(
            `Error listing channels: ${response.error}`
          );
        }
        channels.push(...(response.channels ?? []));
        cursor = response.response_metadata?.next_cursor;

        if (nameFilter) {
          const normalizedNameFilter = removeDiacritics(
            nameFilter.toLowerCase()
          );
          const filteredChannels = channels.filter(
            (channel) =>
              removeDiacritics(channel.name?.toLowerCase() ?? "").includes(
                normalizedNameFilter
              ) ||
              removeDiacritics(
                channel.topic?.value?.toLowerCase() ?? ""
              ).includes(normalizedNameFilter)
          );

          // Early return if we found a channel
          if (filteredChannels.length > 0) {
            return makeMCPToolJSONSuccess({
              message: `The workspace has ${filteredChannels.length} channels containing "${nameFilter}"`,
              result: filteredChannels,
            });
          }
        }
      } while (cursor);

      if (nameFilter) {
        return makeMCPToolJSONSuccess({
          message: `The workspace has ${channels.length} channels but none containing "${nameFilter}"`,
          result: channels,
        });
      }

      return makeMCPToolJSONSuccess({
        message: `The workspace has ${channels.length} channels`,
        result: channels,
      });
    }
  );

  return server;
};

export default createServer;
