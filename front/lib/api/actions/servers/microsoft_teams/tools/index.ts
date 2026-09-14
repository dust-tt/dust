import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
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
import {
  MAX_MESSAGES_TO_SCAN,
  MAX_NUMBER_OF_MESSAGES,
  MESSAGES_PAGE_SIZE,
  shouldContinuePagination,
} from "@app/lib/api/actions/servers/microsoft_teams/tools/pagination";
import config from "@app/lib/api/config";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import sanitizeHtml from "sanitize-html";

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

      // Range on createdDateTime, not lastModifiedDateTime: a message sent
      // in-range but edited/reacted-to later (which bumps lastModifiedDateTime)
      // must still count, and one sent outside the range must not be pulled in
      // by a later edit.
      const isMessageInDateRange = (message: TeamsMessage): boolean => {
        const messageDate = new Date(message.createdDateTime);
        const afterFromDate = !fromDateTime || messageDate >= fromDateTime;
        const beforeToDate = messageDate <= toDateTime;
        return afterFromDate && beforeToDate;
      };

      const messagesSuffix = messageId ? `/${messageId}/replies` : "";
      const baseEndpoint = chatId
        ? `/chats/${chatId}/messages${messagesSuffix}`
        : `/teams/${teamId}/channels/${channelId}/messages${messagesSuffix}`;

      let request = client.api(baseEndpoint).top(MESSAGES_PAGE_SIZE);

      // Only the chat messages listing supports $orderby/$filter; order it by
      // createdDateTime so the page order matches the field we range on.
      // Channels and the replies endpoint keep Graph's default
      // lastModifiedDateTime order. The stop condition keys off whichever it is
      // — see shouldContinuePagination.
      const isChatListing = Boolean(chatId) && !messageId;
      const orderingField = isChatListing
        ? "createdDateTime"
        : "lastModifiedDateTime";

      if (isChatListing) {
        request = request.orderby(`${orderingField} desc`);

        // Push the upper bound server-side so Graph skips messages newer than
        // toDate instead of us fetching and discarding them. createdDateTime
        // only supports `lt` (no `gt`), so the lower bound stays client-side.
        // +1ms keeps the exclusive server filter a superset of the inclusive
        // client filter; $filter needs $orderby on the same property (above).
        if (toDate) {
          const toBound = new Date(toDateTime.getTime() + 1);
          request = request.filter(
            `${orderingField} lt ${toBound.toISOString()}`
          );
        }
      }

      // Accumulate in-range messages, then defer the keep-paging decision.
      const processMessages = (
        messages: TeamsMessage[] | undefined
      ): boolean => {
        if (messages && messages.length > 0) {
          allMessages.push(...messages.filter(isMessageInDateRange));
        }
        return shouldContinuePagination({
          pageMessages: messages,
          fromDateTime,
          collectedCount: allMessages.length,
          orderingField,
        });
      };

      let response = await request.get();
      let scannedCount = response.value?.length ?? 0;

      let shouldContinue = processMessages(response.value);

      nextLink = response["@odata.nextLink"];
      while (
        nextLink &&
        shouldContinue &&
        scannedCount < MAX_MESSAGES_TO_SCAN
      ) {
        response = await client.api(nextLink).get();
        scannedCount += response.value?.length ?? 0;
        shouldContinue = processMessages(response.value);
        nextLink = response["@odata.nextLink"];
      }

      // More pages were available and still in range when we stopped: truncated
      // by the backstop, not the data. (Reaching fromDate or the message limit
      // clears shouldContinue, so neither trips this.)
      const truncatedByScanLimit =
        !!nextLink && shouldContinue && scannedCount >= MAX_MESSAGES_TO_SCAN;
      if (truncatedByScanLimit) {
        logger.warn(
          {
            endpoint: baseEndpoint,
            scannedCount,
            collected: allMessages.length,
          },
          "[microsoft_teams.list_messages] Hit MAX_MESSAGES_TO_SCAN; results may be truncated."
        );
      }

      const matchedCount = allMessages.length;
      const limitedMessages = allMessages.slice(0, MAX_NUMBER_OF_MESSAGES);

      const content = [
        {
          type: "text" as const,
          text: JSON.stringify(limitedMessages, null, 2),
        },
      ];
      // Tell the caller when results are incomplete so an agent can narrow the
      // range rather than treat partial history as complete.
      if (truncatedByScanLimit) {
        content.push({
          type: "text" as const,
          text:
            `Note: stopped after scanning ${scannedCount} messages before reaching the start of the requested date range, so older messages in the range may be missing. ` +
            `Narrow the date range (a smaller fromDate-toDate window) to retrieve the rest.`,
        });
      } else if (matchedCount > MAX_NUMBER_OF_MESSAGES) {
        content.push({
          type: "text" as const,
          text:
            `Note: more than ${MAX_NUMBER_OF_MESSAGES} messages match the requested range; showing ${MAX_NUMBER_OF_MESSAGES} of them. ` +
            `Narrow the date range to retrieve the rest.`,
        });
      }

      return new Ok(content);
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
    { auth, authInfo, runContext }
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

      if (isAgentLoopRunContext(runContext)) {
        const agentUrl = getConversationRoute(
          auth.getNonNullableWorkspace().sId,
          "new",
          `agentDetails=${runContext.agentConfiguration.sId}`,
          config.getAppUrl()
        );
        const agentName = runContext.agentConfiguration.name;
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

    let meetingId: string | undefined;
    let transcriptId: string | undefined;

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

      meetingId = onlineMeetings[0].id;

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
      transcriptId = latestTranscript.id;
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message ||
            "Failed to get transcript id from meeting"
        )
      );
    }

    // The /content endpoint supports the following formats. Select text/vtt with either the
    // $format query parameter or the Accept request header. The
    // application/vnd.microsoft.graph.transcript+text format must be selected with the Accept
    // request header.
    // See: https://learn.microsoft.com/en-us/graph/api/calltranscript-get?view=graph-rest-1.0&tabs=http#transcript-content-formats
    const formats = [
      "text/vtt", // With speaker-attributed content - Requires extra permission on the tenant.
      "application/vnd.microsoft.graph.transcript+text", // Without speaker-attributed content
    ] as const;
    for (const format of formats) {
      try {
        const contentResponse = await client
          .api(
            `/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`
          )
          .header("Accept", format)
          // The SDK infers the response type from Content-Type, preserving messages
          // in JSON error bodies and returning successful transcript bodies as
          // ReadableStreams handled below.
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
            text:
              format === "application/vnd.microsoft.graph.transcript+text"
                ? "Note: this Office 365 tenant has disabled speaker-attributed transcript content retrieval. Here is the transcript without speaker-attributed content:\n\n" +
                  text
                : text,
          },
        ]);
      } catch (err) {
        const normalizedError = normalizeError(err);
        // If the error is because the tenant has disabled speaker-attributed transcript content, skip and try the next format without speaker-attributed content.
        if (
          format === "text/vtt" &&
          normalizedError.message.includes(
            "Speaker-attributed transcript content is disabled for this tenant"
          )
        ) {
          continue;
        }

        return new Err(
          new MCPError(
            normalizedError.message || "Failed to get transcript content"
          )
        );
      }
    }
    // Typescript can't infer that we've tried all formats, so we need to return an error.
    return new Err(new MCPError("Failed to get transcript content"));
  },
};

export const TOOLS = buildTools(MICROSOFT_TEAMS_TOOLS_METADATA, handlers);
