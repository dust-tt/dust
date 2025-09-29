import type {
  GetConversationsResponseType,
  PostConversationsResponseType,
} from "@dust-tt/client";
import { PublicPostConversationsRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import {
  createConversation,
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
import { hasReachedPublicAPILimits } from "@app/lib/api/public_api_limits";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type {
  ContentFragmentType,
  UserMessageContext,
  UserMessageType,
  WithAPIErrorResponse,
} from "@app/types";
import {
  ConversationError,
  isContentFragmentInput,
  isContentFragmentInputWithContentNode,
  isContentFragmentInputWithFileId,
  isContentFragmentInputWithInlinedContent,
  isEmptyString,
} from "@app/types";
import { ExecutionModeSchema } from "@app/types/assistant/agent_run";

const MAX_CONVERSATION_DEPTH = 4;

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
      } = r.data;

      const executionModeParseResult = ExecutionModeSchema.safeParse(
        req.query.execution
      );
      const executionMode = executionModeParseResult.success
        ? executionModeParseResult.data
        : undefined;

      const hasReachedLimits = await hasReachedPublicAPILimits(auth);
      if (hasReachedLimits) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message:
              "Monthly API usage limit exceeded. Please upgrade your plan or wait until your " +
              "limit resets next billing period.",
          },
        });
      }

      if (message) {
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

        const isRunAgent =
          message.context.origin === "run_agent" ||
          message.context.origin === "agent_handover";
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

      let conversation = await createConversation(auth, {
        title: title ?? null,
        // Temporary translation layer for deprecated "workspace" visibility.
        visibility: visibility === "workspace" ? "unlisted" : visibility,
        depth,
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
          origin: message.context.origin ?? "api",
          profilePictureUrl: message.context.profilePictureUrl ?? null,
          timezone: message.context.timezone,
          username: message.context.username,
          originMessageId: message.context.originMessageId ?? null,
        };

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

        // If a message was provided we do await for the message to be created before returning the
        // conversation along with the message. `postUserMessage` returns as soon as the user message
        // and the agent messages are created, while `postUserMessageAndWaitForCompletion` waits for
        // the agent messages to be fully generated.
        const messageRes =
          blocking === true
            ? await postUserMessageAndWaitForCompletion(auth, {
                content: message.content,
                context: ctx,
                conversation,
                executionMode,
                mentions: message.mentions,
                skipToolsValidation: skipToolsValidation ?? false,
              })
            : await postUserMessage(auth, {
                content: message.content,
                context: ctx,
                conversation,
                executionMode,
                mentions: message.mentions,
                skipToolsValidation: skipToolsValidation ?? false,
              });

        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
        }

        newMessage = messageRes.value.userMessage;
      }

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
        conversation,
        message: newMessage ?? undefined,
        contentFragment: newContentFragment ?? undefined,
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
        await ConversationResource.listConversationsForUser(auth);
      res.status(200).json({ conversations });
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

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { GET: "read:conversation", POST: "create:conversation" },
});
