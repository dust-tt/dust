import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { PROJECT_CONVERSATION_TOOLS_METADATA } from "@app/lib/api/actions/servers/project_conversation/metadata";
import {
  getProjectSpace,
  getWritableProjectContext,
  makeSuccessResponse,
  withErrorHandling,
} from "@app/lib/api/actions/servers/project_manager/helpers";
import {
  formatConversationForDisplay,
  formatConversationsForDisplay,
} from "@app/lib/api/actions/servers/project_manager/tools/conversation_formatting";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import {
  getConversation,
  getLightConversation,
} from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import { searchProjectConversations } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";

/** Matches space-scoped conversation semantic search API cutoff. */
const SEMANTIC_SEARCH_SCORE_CUTOFF = 0.1;

const LIST_CONVERSATIONS_DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function formatListedConversationWithoutMessages(
  c: ConversationResource,
  workspaceSId: string
) {
  const j = c.toJSON();
  return {
    sId: j.sId,
    title: j.title ?? "Untitled Conversation",
    created: new Date(j.created).toISOString(),
    updated: new Date(j.updated).toISOString(),
    unread: j.unread,
    actionRequired: j.actionRequired,
    hasError: j.hasError,
    conversationUrl: getConversationRoute(
      workspaceSId,
      j.sId,
      undefined,
      config.getAppUrl()
    ),
  };
}

export function createProjectConversationTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof PROJECT_CONVERSATION_TOOLS_METADATA> = {
    create_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const user = auth.getNonNullableUser();
        const owner = auth.getNonNullableWorkspace();

        // Get origin and timezone from the current conversation
        let origin: UserMessageOrigin = "web";
        let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (agentLoopContext?.runContext?.conversation?.content) {
          const userMessage = agentLoopContext.runContext.conversation.content
            .flat()
            .findLast(isUserMessageType);
          if (userMessage?.context) {
            origin = userMessage.context.origin ?? origin;
            timezone = userMessage.context.timezone ?? timezone;
          }
        }

        // Get agent configuration name & profile picture URL
        const agentName =
          agentLoopContext?.runContext?.agentConfiguration?.name ?? "Agent";

        const agentProfilePictureUrl =
          agentLoopContext?.runContext?.agentConfiguration?.pictureUrl ?? null;

        // Build mentions if agentId is provided
        const mentions = params.agentId
          ? [{ configurationId: params.agentId }]
          : [];

        // Create conversation in the project space
        const conversation = await createConversation(auth, {
          title: params.title,
          visibility: "unlisted",
          spaceId: space.id,
        });

        // Post user message
        const messageRes = await postUserMessage(auth, {
          conversation,
          content: params.message,
          mentions,
          context: {
            username: agentName,
            fullName: `@${agentName} on behalf of ${user.fullName()}`,
            email: null,
            profilePictureUrl: agentProfilePictureUrl,
            timezone,
            origin,
            clientSideMCPServerIds: [],
            selectedMCPServerViewIds: [],
            lastTriggerRunAt: null,
          },
          skipToolsValidation: false,
          doNotAssociateUser: true,
          skipDustAutoMention: true,
        });

        if (messageRes.isErr()) {
          return new Err(
            new MCPError(
              `Failed to post message: ${messageRes.error.api_error.message}`,
              { tracked: false }
            )
          );
        }

        const conversationUrl = getConversationRoute(
          owner.sId,
          conversation.sId,
          undefined,
          config.getAppUrl()
        );

        return new Ok(
          makeSuccessResponse({
            success: true,
            conversationId: conversation.sId,
            conversationUrl,
            userMessageId: messageRes.value.userMessage.sId,
            message: `Conversation created successfully in project "${space.name}"`,
          })
        );
      }, "Failed to create conversation");
    },

    list_conversations: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const {
          unreadOnly = false,
          limit = 20,
          pageCursor,
          includeMessages = false,
        } = params;

        const updatedSinceMs =
          params.updatedSince ??
          Date.now() - LIST_CONVERSATIONS_DEFAULT_LOOKBACK_MS;

        const listOptions = {
          updatedSince: updatedSinceMs,
          excludeTest: true,
        };

        if (!unreadOnly) {
          const {
            conversations: resourcePage,
            hasMore,
            lastValue,
          } = await ConversationResource.listConversationsInSpacePaginated(
            auth,
            {
              spaceId: space.sId,
              options: listOptions,
              pagination: {
                limit,
                lastValue: pageCursor,
              },
            }
          );

          if (resourcePage.length === 0) {
            return new Ok([
              {
                type: "text" as const,
                text: `No conversations found in project "${space.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
              },
            ]);
          }

          const owner = auth.getNonNullableWorkspace();
          let conversationsPayload: unknown[];

          if (includeMessages) {
            const conversationResults = await concurrentExecutor(
              resourcePage,
              async (c) => getLightConversation(auth, c.sId, false),
              { concurrency: 10 }
            );
            const conversationsForDisplay = conversationResults
              .filter((r) => r.isOk())
              .map((r) => r.value);
            conversationsPayload = formatConversationsForDisplay(
              conversationsForDisplay,
              owner.sId
            );
          } else {
            conversationsPayload = resourcePage.map((c) =>
              formatListedConversationWithoutMessages(c, owner.sId)
            );
          }

          const nextPageCursor = hasMore && lastValue ? lastValue : null;
          return new Ok(
            makeSuccessResponse({
              success: true,
              count: conversationsPayload.length,
              unreadOnly: false,
              includeMessages,
              updatedSince: updatedSinceMs,
              hasMore,
              nextPageCursor,
              conversations: conversationsPayload,
              message: `Found ${conversationsPayload.length} conversation(s) in project "${space.name}" (page)${hasMore ? ". Pass nextPageCursor to fetch older updates in this window." : ""}.`,
            })
          );
        }

        const spaceConversations =
          await ConversationResource.listConversationsInSpace(auth, {
            spaceId: space.sId,
            options: listOptions,
          });

        const unreadResources = spaceConversations.filter(
          (c) => c.toJSON().unread
        );
        const pageResources = unreadResources.slice(0, limit);

        if (pageResources.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No unread conversations found in project "${space.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
            },
          ]);
        }

        const owner = auth.getNonNullableWorkspace();
        let conversationsPayload: unknown[];

        if (includeMessages) {
          const conversationResults = await concurrentExecutor(
            pageResources,
            async (c) => getLightConversation(auth, c.sId, false),
            { concurrency: 10 }
          );
          const withContent = conversationResults
            .filter((r) => r.isOk())
            .map((r) => r.value);
          conversationsPayload = formatConversationsForDisplay(
            withContent,
            owner.sId
          );
        } else {
          conversationsPayload = pageResources.map((c) =>
            formatListedConversationWithoutMessages(c, owner.sId)
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: pageResources.length,
            total: unreadResources.length,
            unreadOnly: true,
            includeMessages,
            updatedSince: updatedSinceMs,
            conversations: conversationsPayload,
            message: `Found ${pageResources.length} unread conversation(s) in project "${space.name}"${unreadResources.length > limit ? ` (showing first ${limit} of ${unreadResources.length})` : ""}.`,
          })
        );
      }, "Failed to list project conversations");
    },

    search_conversations: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { query, limit: topK = 10 } = params;

        const searchRes = await searchProjectConversations(auth, {
          query,
          spaceIds: [space.sId],
          topK,
        });

        if (searchRes.isErr()) {
          return new Err(
            new MCPError(
              `Failed to search conversations: ${searchRes.error.message}`,
              { tracked: false }
            )
          );
        }

        const filteredResults = searchRes.value.filter(
          (r) => r.score >= SEMANTIC_SEARCH_SCORE_CUTOFF
        );

        if (filteredResults.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No matching conversations found in project "${space.name}" for this query.`,
            },
          ]);
        }

        const conversationResults = await concurrentExecutor(
          filteredResults,
          async (r) => getLightConversation(auth, r.conversationId, false),
          { concurrency: 10 }
        );

        const owner = auth.getNonNullableWorkspace();
        const conversationsWithScores: Array<{
          formatted: ReturnType<typeof formatConversationForDisplay>;
          score: number;
        }> = [];

        for (let i = 0; i < filteredResults.length; i++) {
          const convRes = conversationResults[i];
          if (convRes?.isOk()) {
            conversationsWithScores.push({
              formatted: formatConversationForDisplay(convRes.value, owner.sId),
              score: filteredResults[i].score,
            });
          }
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: conversationsWithScores.length,
            query,
            conversations: conversationsWithScores.map(
              ({ formatted, score }) => ({
                ...formatted,
                relevanceScore: score,
              })
            ),
            message: `Found ${conversationsWithScores.length} conversation(s) in project "${space.name}" matching the query.`,
          })
        );
      }, "Failed to search project conversations");
    },

    add_message_to_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const user = auth.getNonNullableUser();
        const owner = auth.getNonNullableWorkspace();

        const conversationId =
          params.conversationId ??
          agentLoopContext?.runContext?.conversation?.sId;

        if (!conversationId) {
          return new Err(
            new MCPError(
              "No conversationId provided and no conversation in agent context; pass conversationId explicitly.",
              { tracked: false }
            )
          );
        }

        const conversationRes = await getConversation(
          auth,
          conversationId,
          false
        );
        if (conversationRes.isErr()) {
          return new Err(
            new MCPError(`Conversation not found: ${conversationId}`, {
              tracked: false,
            })
          );
        }

        const conversation = conversationRes.value;
        if (conversation.spaceId !== space.sId) {
          return new Err(
            new MCPError("Conversation is not in this project", {
              tracked: false,
            })
          );
        }

        let origin: UserMessageOrigin = "web";
        let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (agentLoopContext?.runContext?.conversation?.content) {
          const userMessage = agentLoopContext.runContext.conversation.content
            .flat()
            .findLast(isUserMessageType);
          if (userMessage?.context) {
            origin = userMessage.context.origin ?? origin;
            timezone = userMessage.context.timezone ?? timezone;
          }
        }

        const agentName =
          agentLoopContext?.runContext?.agentConfiguration?.name ?? "Agent";
        const agentProfilePictureUrl =
          agentLoopContext?.runContext?.agentConfiguration?.pictureUrl ?? null;

        const mentions = params.agentId
          ? [{ configurationId: params.agentId }]
          : [];

        const messageRes = await postUserMessage(auth, {
          conversation,
          content: params.message,
          mentions,
          context: {
            username: agentName,
            fullName: `@${agentName} on behalf of ${user.fullName()}`,
            email: null,
            profilePictureUrl: agentProfilePictureUrl,
            timezone,
            origin,
            clientSideMCPServerIds: [],
            selectedMCPServerViewIds: [],
            lastTriggerRunAt: null,
          },
          skipToolsValidation: false,
          doNotAssociateUser: true,
          skipDustAutoMention: true,
        });

        if (messageRes.isErr()) {
          return new Err(
            new MCPError(
              `Failed to post message: ${messageRes.error.api_error.message}`,
              { tracked: false }
            )
          );
        }

        const conversationUrl = getConversationRoute(
          owner.sId,
          conversation.sId,
          undefined,
          config.getAppUrl()
        );

        return new Ok(
          makeSuccessResponse({
            success: true,
            conversationId: conversation.sId,
            conversationUrl,
            userMessageId: messageRes.value.userMessage.sId,
            message: `Message posted to conversation in project "${space.name}".`,
          })
        );
      }, "Failed to add message to conversation");
    },
  };

  return buildTools(PROJECT_CONVERSATION_TOOLS_METADATA, handlers);
}
