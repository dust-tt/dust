import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import {
  createConversation,
  isUserMessageContextValid,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { isUserMessageContextOverflowing } from "@app/lib/api/assistant/conversation/helper";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import {
  checkProgrammaticUsageLimits,
  isProgrammaticUsage,
} from "@app/lib/api/programmatic_usage/tracking";
import {
  addBackwardCompatibleConversationFields,
  addBackwardCompatibleConversationWithoutContentFields,
  normalizeConversationVisibility,
} from "@app/lib/api/v1/backward_compatibility";
import { isApiBlocked } from "@app/lib/metronome/user_block";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  isContentFragmentInput,
  isContentFragmentInputWithContentNode,
  isContentFragmentInputWithFileId,
  isContentFragmentInputWithInlinedContent,
} from "@app/types/api/internal/assistant";
import type {
  AgenticMessageData,
  UserMessageContext,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isInteractiveContentType } from "@app/types/files";
import { isCreditPricedPlan } from "@app/types/plan";
import { isEmptyString } from "@app/types/shared/utils/general";
import {
  type GetConversationsResponseType,
  type PostConversationsResponseType,
  PublicPostConversationsRequestBodySchema,
} from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import conversation from "./[cId]";

export const MAX_CONVERSATION_DEPTH = 4;

// Mounted at /api/v1/w/:wId/assistant/conversations.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Create a new conversation in the workspace identified by {wId}.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 $ref: '#/components/schemas/Message'
 *               contentFragments:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ContentFragment'
 *                 description: The list of content fragments to attach to this conversation (optional)
 *               title:
 *                 type: string
 *                 description: The title of the conversation
 *                 example: My conversation
 *               skipToolsValidation:
 *                 type: boolean
 *                 description: Whether to skip the tools validation of the agent messages triggered by this user message (optional, defaults to false)
 *                 example: false
 *               blocking:
 *                 type: boolean
 *                 description: Whether to wait for the agent to generate the initial message. If true the query will wait for the agent's answer. If false (default), the API will return a conversation ID directly and you will need to use streaming events to get the messages.
 *                 example: true
 *               spaceId:
 *                 type: string
 *                 description: The sId of the space (project) in which to create the conversation (optional). If not provided, the conversation is created outside projects
 *                 example: space_abc123
 *     responses:
 *       200:
 *         description: Conversation created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded.
 *       500:
 *         description: Internal Server Error
 */
app.post(
  "/",
  validate("json", PublicPostConversationsRequestBodySchema),
  async (ctx): HandlerResult<PostConversationsResponseType> => {
    const auth = ctx.get("auth");
    const {
      title,
      visibility,
      depth,
      message,
      contentFragment,
      contentFragments,
      skipToolsValidation,
      blocking,
      spaceId,
    } = ctx.req.valid("json");

    const origin = message?.context.origin ?? "api";

    if (message) {
      // Keep this before createConversation to avoid creating an empty conversation when the
      // initial programmatic message is blocked. Credit-priced plans gate on the workspace
      // pool (new system); legacy plans use the programmatic-credits check.
      if (isProgrammaticUsage(auth, { userMessageOrigin: origin })) {
        const workspace = auth.getNonNullableWorkspace();
        const plan = auth.subscription()?.plan;
        if (plan && isCreditPricedPlan(plan)) {
          if (
            workspace.metronomeCustomerId &&
            (await isApiBlocked(workspace.sId))
          ) {
            return apiError(ctx, {
              status_code: 429,
              api_error: {
                type: "rate_limit_error",
                message:
                  "Your workspace has run out of credits. Please purchase more credits to continue.",
              },
            });
          }
        } else {
          const limitsResult = await checkProgrammaticUsageLimits(auth);
          if (limitsResult.isErr()) {
            return apiError(ctx, {
              status_code: 429,
              api_error: {
                type: "rate_limit_error",
                message: limitsResult.error.message,
              },
            });
          }
        }
      }

      if (isUserMessageContextOverflowing(message.context)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The message.context properties (username, timezone, fullName, and email) " +
              "must be less than 255 characters.",
          },
        });
      }

      if (isEmptyString(message.context.username)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The message.context.username must be a non-empty string.",
          },
        });
      }

      // Local MCP servers are only available to authenticated users (not API keys).
      if (message.context.clientSideMCPServerIds) {
        if (!auth.user()) {
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "invalid_request_error",
              message:
                "Local MCP servers are only available to authenticated users.",
            },
          });
        }

        const hasServerAccess = await concurrentExecutor(
          message.context.clientSideMCPServerIds,
          async (serverId) =>
            validateMCPServerAccess(auth, {
              serverId,
            }),
          { concurrency: 10 }
        );

        if (hasServerAccess.some((r) => r === false)) {
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message: "User does not have access to the local MCP servers.",
            },
          });
        }
      }

      const isRunAgent = !!message.agenticMessageData;
      if (isRunAgent && !auth.isSystemKey()) {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message:
              "Messages from run_agent or agent_handover must come from a system key.",
          },
        });
      }
    }

    if (depth && depth >= MAX_CONVERSATION_DEPTH) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Recursive run_agent calls exceeded depth of ${MAX_CONVERSATION_DEPTH}`,
        },
      });
    }

    const resolvedFragments = [...(contentFragments ?? [])];
    if (contentFragment) {
      resolvedFragments.push(contentFragment);
    }

    for (const fragment of resolvedFragments) {
      if (fragment.content) {
        if (
          fragment.content.length === 0 ||
          fragment.content.length > 512 * 1024
        ) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The content must be a non-empty string of less than 512kB.",
            },
          });
        }
      }
    }

    for (const fragment of resolvedFragments) {
      if (!isContentFragmentInput(fragment)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid content fragment type.",
          },
        });
      }
    }

    // Resolve space if spaceId is provided
    let resolvedSpaceModelId: number | null = null;
    if (spaceId) {
      const space = await SpaceResource.fetchById(auth, spaceId);
      if (!space || !space.isMember(auth)) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Space not found or access denied",
          },
        });
      }
      resolvedSpaceModelId = space.id;
    }

    let conversation = await createConversation(auth, {
      title: title ?? null,
      visibility: normalizeConversationVisibility(visibility),
      depth,
      spaceId: resolvedSpaceModelId,
    });

    if (conversation.depth === 0) {
      await ConversationResource.upsertParticipation(auth, {
        conversation,
        action: "subscribed",
        user: auth.user()?.toJSON() ?? null,
      });
    }

    let newContentFragment: ContentFragmentType | null = null;
    let newMessage: UserMessageType | null = null;

    for (const resolvedFragment of resolvedFragments) {
      const { context, ...rest } = resolvedFragment;
      let cf = rest;

      if (isContentFragmentInputWithInlinedContent(cf)) {
        const contentFragmentRes = await toFileContentFragment(auth, {
          conversation,
          contentFragment: cf,
        });
        if (contentFragmentRes.isErr()) {
          if (contentFragmentRes.error.code === "file_type_not_supported") {
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: contentFragmentRes.error.message,
              },
            });
          }
          throw new Error(contentFragmentRes.error.message);
        }
        cf = contentFragmentRes.value;
      }
      if (
        isContentFragmentInputWithFileId(cf) ||
        isContentFragmentInputWithContentNode(cf)
      ) {
        const cfRes = await postNewContentFragment(auth, conversation, cf, {
          username: context?.username ?? null,
          fullName: context?.fullName ?? null,
          email: context?.email?.toLowerCase() ?? null,
          profilePictureUrl: context?.profilePictureUrl ?? null,
        });
        if (cfRes.isErr()) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: cfRes.error.message,
            },
          });
        }
        newContentFragment = cfRes.value;
      }

      const updatedConversationRes = await getConversation(
        auth,
        conversation.sId
      );

      if (updatedConversationRes.isErr()) {
        // Preserving former code in which if the conversation was not found here, we do not error
        if (
          !(
            updatedConversationRes.error instanceof ConversationError &&
            updatedConversationRes.error.type === "conversation_not_found"
          )
        ) {
          return apiErrorForConversation(ctx, updatedConversationRes.error);
        }
      } else {
        conversation = updatedConversationRes.value;
      }
    }

    if (message) {
      const messageContext: UserMessageContext = {
        clientSideMCPServerIds: message.context.clientSideMCPServerIds ?? [],
        email: message.context.email?.toLowerCase() ?? null,
        fullName: message.context.fullName ?? null,
        origin,
        profilePictureUrl: message.context.profilePictureUrl ?? null,
        timezone: message.context.timezone,
        username: message.context.username,
      };

      const agenticMessageData: AgenticMessageData | undefined =
        message.agenticMessageData ?? undefined;

      // If tools are enabled, we need to add the MCP server views to the conversation before posting the message.
      if (message.context.selectedMCPServerViewIds) {
        if (!auth.user()) {
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "invalid_request_error",
              message:
                "Selecting MCP server views is only available to authenticated users.",
            },
          });
        }

        const mcpServerViews = await MCPServerViewResource.fetchByIds(
          auth,
          message.context.selectedMCPServerViewIds
        );

        const r = await ConversationResource.upsertMCPServerViews(auth, {
          conversation,
          mcpServerViews,
          enabled: true,
          source: "conversation",
          agentConfigurationId: null,
        });
        if (r.isErr()) {
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to add MCP server views to conversation",
            },
          });
        }
      }

      const validateUserMessageContextRes = isUserMessageContextValid(
        auth,
        ctx.req.header(),
        messageContext
      );
      if (!validateUserMessageContextRes) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "This origin is not allowed. Remove the origin from the context property.",
          },
        });
      }

      // If a message was provided we do await for the message to be created before returning the
      // conversation along with the message. `postUserMessage` returns as soon as the user message
      // and the agent messages are created, while `postUserMessageAndWaitForCompletion` waits for
      // the agent messages to be fully generated.
      const messageRes =
        blocking === true
          ? await postUserMessageAndWaitForCompletion(auth, {
              content: message.content,
              context: messageContext,
              agenticMessageData,
              conversation,
              mentions: message.mentions,
              skipToolsValidation: skipToolsValidation ?? false,
            })
          : await postUserMessage(auth, {
              content: message.content,
              context: messageContext,
              agenticMessageData,
              conversation,
              mentions: message.mentions,
              skipToolsValidation: skipToolsValidation ?? false,
            });

      if (messageRes.isErr()) {
        return apiError(ctx, messageRes.error);
      }

      newMessage = messageRes.value.userMessage;
    }

    if (newContentFragment || newMessage) {
      // If we created a user message or a content fragment (or both) we retrieve the
      // conversation. If a user message was posted, we know that the agent messages have been
      // created as well, so pulling the conversation again will allow to have an up to date view
      // of the conversation with agent messages included so that the user of the API can start
      // streaming events from these agent messages directly.
      const updatedRes = await getConversation(auth, conversation.sId);

      if (updatedRes.isErr()) {
        return apiErrorForConversation(ctx, updatedRes.error);
      }
      conversation = updatedRes.value;
    }

    return ctx.json({
      conversation: addBackwardCompatibleConversationFields(conversation),
      message: newMessage ?? undefined,
      contentFragment:
        !newContentFragment ||
        isInteractiveContentType(newContentFragment.contentType)
          ? undefined
          : {
              ...newContentFragment,
              contentType: newContentFragment.contentType,
            },
    });
  }
);

app.get("/", async (ctx): HandlerResult<GetConversationsResponseType> => {
  const auth = ctx.get("auth");

  if (!auth.user()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "user_not_found",
        message:
          "Getting conversations is only available when authenticated as a user.",
      },
    });
  }

  const conversations =
    await ConversationResource.listPrivateConversationsForUser(auth);
  return ctx.json({
    conversations: conversations.map((c) =>
      addBackwardCompatibleConversationWithoutContentFields(auth, c.toJSON())
    ),
  });
});

app.route("/:cId", conversation);

export default app;
