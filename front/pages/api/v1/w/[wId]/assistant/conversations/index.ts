import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import {
  createConversation,
  isUserMessageContextValid,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  apiErrorForConversation,
  isUserMessageContextOverflowing,
} from "@app/lib/api/assistant/conversation/helper";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import {
  checkProgrammaticUsageLimits,
  isProgrammaticUsage,
} from "@app/lib/api/programmatic_usage/tracking";
import {
  addBackwardCompatibleConversationFields,
  addBackwardCompatibleConversationWithoutContentFields,
  normalizeConversationVisibility,
} from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
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
import type { WithAPIErrorResponse } from "@app/types/error";
import { isInteractiveContentFileContentType } from "@app/types/files";
import { isEmptyString } from "@app/types/shared/utils/general";
import type {
  GetConversationsResponseType,
  PostConversationsResponseType,
} from "@dust-tt/client";
import { PublicPostConversationsRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

export const MAX_CONVERSATION_DEPTH = 4;

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostConversationsResponseType | GetConversationsResponseType
    >
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      const r = PublicPostConversationsRequestBodySchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

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
      } = r.data;

      if (
        req.body.message?.context?.origin &&
        message?.context?.origin &&
        req.body.message.context.origin !== message.context.origin
      ) {
        logger.warn(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            authMethod: auth.authMethod(),
            originProvided: req.body.message.context.origin,
            originUsed: message.context.origin,
          },
          "Invalid origin used, fallbacking to default value"
        );
      }

      const origin = message?.context.origin ?? "api";

      if (message) {
        if (isProgrammaticUsage(auth, { userMessageOrigin: origin })) {
          const limitsResult = await checkProgrammaticUsageLimits(auth);
          if (limitsResult.isErr()) {
            return apiError(req, res, {
              status_code: 429,
              api_error: {
                type: "rate_limit_error",
                message: limitsResult.error.message,
              },
            });
          }
        }

        if (isUserMessageContextOverflowing(message.context)) {
          return apiError(req, res, {
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
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The message.context.username must be a non-empty string.",
            },
          });
        }

        // Local MCP servers are only available to authenticated users (not API keys).
        if (message.context.clientSideMCPServerIds) {
          if (!auth.user()) {
            return apiError(req, res, {
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
            return apiError(req, res, {
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
          return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Recursive run_agent calls exceeded depth of ${MAX_CONVERSATION_DEPTH}`,
          },
        });
      }

      const resolvedFragments = contentFragments ?? [];
      if (contentFragment) {
        resolvedFragments.push(contentFragment);
      }

      for (const fragment of resolvedFragments) {
        if (fragment.content) {
          if (
            fragment.content.length === 0 ||
            fragment.content.length > 512 * 1024
          ) {
            return apiError(req, res, {
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
          return apiError(req, res, {
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
          return apiError(req, res, {
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

      let newContentFragment: ContentFragmentType | null = null;
      let newMessage: UserMessageType | null = null;

      for (const resolvedFragment of resolvedFragments) {
        const { context, ...rest } = resolvedFragment;
        let contentFragment = rest;

        if (isContentFragmentInputWithInlinedContent(contentFragment)) {
          const contentFragmentRes = await toFileContentFragment(auth, {
            contentFragment,
          });
          if (contentFragmentRes.isErr()) {
            if (contentFragmentRes.error.code === "file_type_not_supported") {
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "invalid_request_error",
                  message: contentFragmentRes.error.message,
                },
              });
            }
            throw new Error(contentFragmentRes.error.message);
          }
          contentFragment = contentFragmentRes.value;
        }
        if (
          isContentFragmentInputWithFileId(contentFragment) ||
          isContentFragmentInputWithContentNode(contentFragment)
        ) {
          const cfRes = await postNewContentFragment(
            auth,
            conversation,
            contentFragment,
            {
              username: context?.username ?? null,
              fullName: context?.fullName ?? null,
              email: context?.email?.toLowerCase() ?? null,
              profilePictureUrl: context?.profilePictureUrl ?? null,
            }
          );
          if (cfRes.isErr()) {
            return apiError(req, res, {
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
            return apiErrorForConversation(
              req,
              res,
              updatedConversationRes.error
            );
          }
        } else {
          conversation = updatedConversationRes.value;
        }
      }

      if (message) {
        const ctx: UserMessageContext = {
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
          const mcpServerViews = await MCPServerViewResource.fetchByIds(
            auth,
            message.context.selectedMCPServerViewIds
          );

          const r = await ConversationResource.upsertMCPServerViews(auth, {
            conversation,
            mcpServerViews,
            enabled: true,
          });
          if (r.isErr()) {
            return apiError(req, res, {
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
          req,
          ctx
        );
        if (!validateUserMessageContextRes) {
          return apiError(req, res, {
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
                context: ctx,
                agenticMessageData,
                conversation,
                mentions: message.mentions,
                skipToolsValidation: skipToolsValidation ?? false,
              })
            : await postUserMessage(auth, {
                content: message.content,
                context: ctx,
                agenticMessageData,
                conversation,
                mentions: message.mentions,
                skipToolsValidation: skipToolsValidation ?? false,
              });

        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
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
          return apiErrorForConversation(req, res, updatedRes.error);
        }
        conversation = updatedRes.value;
      }

      res.status(200).json({
        conversation: addBackwardCompatibleConversationFields(conversation),
        message: newMessage ?? undefined,
        contentFragment:
          !newContentFragment ||
          isInteractiveContentFileContentType(newContentFragment.contentType)
            ? undefined
            : {
                ...newContentFragment,
                contentType: newContentFragment.contentType,
              },
      });
      return;
    case "GET":
      if (!auth.user()) {
        return apiError(req, res, {
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
      res.status(200).json({
        conversations: conversations.map((c) =>
          addBackwardCompatibleConversationWithoutContentFields(
            auth,
            c.toJSON()
          )
        ),
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
