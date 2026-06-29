import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  TeamsChannel,
  TeamsChat,
  TeamsMeeting,
  TeamsMessage,
  TeamsUser,
} from "@app/lib/api/actions/servers/microsoft/utils";
import { getGraphClient } from "@app/lib/api/actions/servers/microsoft/utils";
import { MICROSOFT_TEAMS_TOOLS_METADATA } from "@app/lib/api/actions/servers/microsoft_teams/metadata";
import {
  renderChannels,
  renderChats,
  renderMeetings,
  renderUsers,
} from "@app/lib/api/actions/servers/microsoft_teams/microsoft_teams_rendering";
import config from "@app/lib/api/config";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import sanitizeHtml from "sanitize-html";

const MAX_NUMBER_OF_MESSAGES = 200;
// Safety bound on the number of pages we follow in a single list_messages call.
// The channel endpoint supports no server-side date filtering, so a range whose
// upper bound (toDate) is in the past forces us to walk newest-first through
// history until we reach the window — this caps that walk. 50 pages * 50
// messages/page = up to 2500 messages scanned before we bail out.
const MAX_PAGES_TO_FETCH = 50;

const handlers: ToolHandlers<typeof MICROSOFT_TEAMS_TOOLS_METADATA> = {
  search_messages_content: async ({ query }, { authInfo }) => {
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
  },

  list_teams: async (_params, { authInfo }) => {
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
  },

  list_users: async ({ nameFilter, limit }, { authInfo }) => {
    const client = await getGraphClient(authInfo);
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

  list_channels: async ({ teamId, nameFilter }, { authInfo }) => {
    const client = await getGraphClient(authInfo);
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

  list_chats: async ({ limit, chatType, nameFilter }, { authInfo }) => {
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
        .expand("lastMessagePreview")
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

  list_messages: async (
    { chatId, teamId, channelId, messageId, fromDate, toDate },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    if (!chatId && (!teamId || !channelId)) {
      return new Err(
        new MCPError("Either chatId or both teamId and channelId are required.")
      );
    }

    try {
      const allMessages: TeamsMessage[] = [];
      let nextLink: string | undefined = undefined;
      const fromDateTime = fromDate ? new Date(fromDate) : null;
      const toDateTime = toDate ? new Date(toDate) : new Date();

      // Reject malformed dates up front. Otherwise `new Date("garbage")` yields
      // an Invalid Date, every comparison silently returns false, and the tool
      // returns an empty result with no indication of why.
      if (fromDateTime && isNaN(fromDateTime.getTime())) {
        return new Err(
          new MCPError(
            `Invalid fromDate: "${fromDate}". Expected an ISO 8601 date.`
          )
        );
      }
      if (toDate && isNaN(toDateTime.getTime())) {
        return new Err(
          new MCPError(
            `Invalid toDate: "${toDate}". Expected an ISO 8601 date.`
          )
        );
      }

      // Filter function to check if message is in date range
      const isMessageInDateRange = (message: TeamsMessage): boolean => {
        const messageDate = new Date(message.lastModifiedDateTime);
        const afterFromDate = !fromDateTime || messageDate >= fromDateTime;
        const beforeToDate = messageDate <= toDateTime;
        return afterFromDate && beforeToDate;
      };

      // Process messages and update shouldContinue flag
      const processMessages = (
        messages: TeamsMessage[] | undefined
      ): boolean => {
        // A page may come back empty (e.g. a server-side filter matched nothing
        // on this skiptoken page). Keep following nextLink unless we're full.
        if (!messages || messages.length === 0) {
          return allMessages.length < MAX_NUMBER_OF_MESSAGES;
        }

        const messagesInDateRange = messages.filter(isMessageInDateRange);
        allMessages.push(...messagesInDateRange);

        if (allMessages.length >= MAX_NUMBER_OF_MESSAGES) {
          return false;
        }

        // Messages are returned newest-first, so the last message on the page is
        // the oldest. Messages newer than toDate are simply skipped, not a reason
        // to stop. Keep paginating until the oldest message on this page is older
        // than fromDate — every subsequent (older) page would then be out of range
        // too. With no lower bound, paginate until the message limit is hit.
        const oldestMessageOnPage = messages[messages.length - 1];
        if (!fromDateTime || !oldestMessageOnPage) {
          return true;
        }
        const oldestMessageDate = new Date(
          oldestMessageOnPage.lastModifiedDateTime
        );
        return oldestMessageDate >= fromDateTime;
      };

      const messagesSuffix = messageId ? `/${messageId}/replies` : "";
      const baseEndpoint = chatId
        ? `/chats/${chatId}/messages${messagesSuffix}`
        : `/teams/${teamId}/channels/${channelId}/messages${messagesSuffix}`;

      let request = client.api(baseEndpoint).top(50);

      // The chat messages endpoint supports server-side date filtering, which
      // lets the server skip messages outside the range instead of us paging
      // through and discarding them client-side (the channel endpoint supports
      // neither $filter nor $orderby — see MAX_PAGES_TO_FETCH). We gate this on
      // !messageId because the optimization targets the chat messages listing,
      // not the per-message replies endpoint. The client-side filter below
      // stays authoritative; this is purely a fetch-reduction.
      if (chatId && !messageId) {
        const filterConditions: string[] = [];
        // $filter uses exclusive gt/lt. Nudge the bounds outward by 1ms so the
        // server filter is a strict superset of the inclusive (>=/<=)
        // client-side filter and can never drop a boundary message.
        if (fromDateTime) {
          const fromBound = new Date(fromDateTime.getTime() - 1);
          filterConditions.push(
            `lastModifiedDateTime gt ${fromBound.toISOString()}`
          );
        }
        if (toDate) {
          const toBound = new Date(toDateTime.getTime() + 1);
          filterConditions.push(
            `lastModifiedDateTime lt ${toBound.toISOString()}`
          );
        }
        if (filterConditions.length > 0) {
          // $filter only takes effect when $orderby targets the same property.
          request = request
            .orderby("lastModifiedDateTime desc")
            .filter(filterConditions.join(" and "));
        }
      }

      // First page
      let response = await request.get();

      let shouldContinue = processMessages(response.value);

      // Follow pagination links until no more pages, the date threshold is
      // reached, or we hit the page-count safety bound.
      let pageCount = 1;
      nextLink = response["@odata.nextLink"];
      while (nextLink && shouldContinue && pageCount < MAX_PAGES_TO_FETCH) {
        response = await client.api(nextLink).get();
        shouldContinue = processMessages(response.value);
        nextLink = response["@odata.nextLink"];
        pageCount++;
      }

      // We stopped with more pages still available and still in range: the
      // result set is truncated by the safety bound, not by the data.
      if (nextLink && shouldContinue) {
        logger.warn(
          {
            endpoint: baseEndpoint,
            pageCount,
            collected: allMessages.length,
          },
          "[microsoft_teams.list_messages] Hit MAX_PAGES_TO_FETCH; results may be truncated."
        );
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
      mentions,
    },
    { auth, authInfo, agentLoopContext }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
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
      if (agentLoopContext?.runContext?.agentConfiguration) {
        const agentUrl = getConversationRoute(
          auth.getNonNullableWorkspace().sId,
          "new",
          `agentDetails=${agentLoopContext.runContext.agentConfiguration.sId}`,
          config.getAppUrl()
        );
        const agentName = agentLoopContext.runContext.agentConfiguration.name;
        const footerMessage = `<em>Sent via <a href="${agentUrl}">${agentName} Agent</a> on Dust</em>`;
        finalContent = `${messageContent}<br/><br/>${footerMessage}`;
      }

      // Allow <at id="N"> tags so Teams @mentions are preserved after sanitization.
      const sanitizedContent = sanitizeHtml(finalContent, {
        allowedTags: [...sanitizeHtml.defaults.allowedTags, "at"],
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          at: ["id"],
        },
      });

      const requestBody: Record<string, unknown> = {
        body: {
          contentType: "html",
          content: sanitizedContent,
        },
      };

      if (mentions && mentions.length > 0) {
        requestBody.mentions = mentions.map(
          ({ id, mentionText, userAadId }) => ({
            id,
            mentionText,
            mentioned: {
              user: {
                id: userAadId,
                displayName: mentionText,
                userIdentityType: "aadUser",
              },
            },
          })
        );
      }

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

  list_meetings: async (
    { fromDate, toDate, subjectFilter, participantFilter },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      let apiCall = client
        .api("/me/calendarView")
        .query({
          startDateTime: fromDate,
          endDateTime: toDate,
        })
        .select(
          "id,subject,start,end,organizer,attendees,onlineMeeting,webLink,isOnlineMeeting"
        )
        .orderby("start/dateTime asc")
        .top(10);

      if (subjectFilter) {
        apiCall = apiCall.filter(
          `contains(subject, '${subjectFilter.replace(/'/g, "''")}')`
        );
      }

      const response = await apiCall.get();

      let meetings: TeamsMeeting[] = (
        (response.value as TeamsMeeting[]) ?? []
      ).filter((m) => m.isOnlineMeeting);

      if (participantFilter) {
        const query = participantFilter.toLowerCase();
        meetings = meetings.filter((m) => {
          const organizerMatch =
            m.organizer?.emailAddress?.name?.toLowerCase().includes(query) ||
            m.organizer?.emailAddress?.address?.toLowerCase().includes(query);
          const attendeeMatch = m.attendees?.some(
            (a) =>
              a.emailAddress?.name?.toLowerCase().includes(query) ||
              a.emailAddress?.address?.toLowerCase().includes(query)
          );
          return organizerMatch || attendeeMatch;
        });
      }

      let result = renderMeetings(meetings);

      return new Ok([
        {
          type: "text" as const,
          text: result,
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to list meetings")
      );
    }
  },

  get_transcript_content: async ({ joinUrl }, { authInfo }) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      // Resolve the online meeting from its join URL.
      const meetingResponse = await client
        .api("/me/onlineMeetings")
        .filter(`JoinWebUrl eq '${joinUrl}'`)
        .get();

      const onlineMeetings = meetingResponse.value ?? [];
      if (onlineMeetings.length === 0) {
        return new Err(
          new MCPError(
            "No online meeting found for this join URL. Ensure you are the organizer or a participant."
          )
        );
      }

      const meetingId = onlineMeetings[0].id;

      // List transcripts for this meeting.
      const transcriptsResponse = await client
        .api(`/me/onlineMeetings/${meetingId}/transcripts`)
        .get();

      const transcripts = transcriptsResponse.value ?? [];
      if (transcripts.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: "No transcripts available for this meeting. Transcription may not have been enabled during the meeting.",
          },
        ]);
      }

      // Get the content of the most recent transcript in text format.
      // Transcripts are not returned in a guaranteed order, so sort by
      // createdDateTime descending and pick the first.
      const latestTranscript = [...transcripts].sort((a, b) => {
        const aMs = a.createdDateTime
          ? new Date(a.createdDateTime).getTime() || 0
          : 0;
        const bMs = b.createdDateTime
          ? new Date(b.createdDateTime).getTime() || 0
          : 0;
        return bMs - aMs;
      })[0];
      const transcriptId = latestTranscript.id;
      const contentResponse = await client
        .api(
          `/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`
        )
        .query({ $format: "text/vtt" })
        .responseType("text" as any)
        .get();

      let text: string;
      if (typeof contentResponse === "string") {
        text = contentResponse;
      } else if (
        contentResponse &&
        typeof contentResponse.text === "function"
      ) {
        text = await contentResponse.text();
      } else if (contentResponse instanceof ReadableStream) {
        const reader = contentResponse.getReader();
        const chunks: string[] = [];
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            chunks.push(decoder.decode(result.value, { stream: !done }));
          }
        }
        text = chunks.join("");
      } else {
        text = String(contentResponse);
      }

      return new Ok([
        {
          type: "text" as const,
          text,
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to get transcript content"
        )
      );
    }
  },
};

export const TOOLS = buildTools(MICROSOFT_TEAMS_TOOLS_METADATA, handlers);
