/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages:
 *   get:
 *     summary: List messages in a conversation
 *     description: Retrieve a paginated list of messages for a specific conversation.
 *     tags:
 *       - Private Messages
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - $ref: '#/components/schemas/PrivateUserMessage'
 *                       - $ref: '#/components/schemas/PrivateLightAgentMessage'
 *                       - $ref: '#/components/schemas/PrivateContentFragment'
 *                 hasMore:
 *                   type: boolean
 *                 lastValue:
 *                   type: integer
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Post a message to a conversation
 *     description: Post a new user message to an existing conversation, triggering agent responses.
 *     tags:
 *       - Private Messages
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
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
 *               - content
 *               - context
 *               - mentions
 *             properties:
 *               content:
 *                 type: string
 *               mentions:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PrivateMention'
 *               context:
 *                 type: object
 *                 properties:
 *                   timezone:
 *                     type: string
 *                   profilePictureUrl:
 *                     type: string
 *                     nullable: true
 *                   origin:
 *                     type: string
 *                     nullable: true
 *                   clientSideMCPServerIds:
 *                     type: array
 *                     items:
 *                       type: string
 *               skipToolsValidation:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Successfully posted message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/PrivateUserMessage'
 *                 contentFragments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateContentFragment'
 *                 agentMessages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateAgentMessage'
 *       401:
 *         description: Unauthorized
 */
import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { isSidekickConversation } from "@app/lib/api/actions/servers/helpers";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getStatsDClient } from "@app/lib/utils/statsd";

import { apiError } from "@app/logger/withlogging";
import { InternalPostMessagesRequestBodySchema } from "@app/types/api/internal/assistant";
import type {
  AgentMessageType,
  LegacyLightMessageType,
  LightMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { WithAPIErrorResponse } from "@app/types/error";
import { removeNulls } from "@app/types/shared/utils/general";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type PostMessagesResponseBody = {
  message: UserMessageType;
  contentFragments: ContentFragmentType[];
  agentMessages: AgentMessageType[];
};

// TODO remove after monday 2025-12-01 (once everyone has likely reloaded their browser)
interface LegacyFetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LegacyLightMessageType[];
}

export interface FetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LightMessageType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | PostMessagesResponseBody
      | LegacyFetchConversationMessagesResponse
      | FetchConversationMessagesResponse
    >
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();

  if (typeof req.query.cId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;

  switch (req.method) {
    case "GET":
      const messageStartTime = performance.now();

      const paginationRes = getPaginationParams(req, {
        defaultLimit: 10,
        defaultOrderColumn: "rank",
        defaultOrderDirection: "desc",
        supportedOrderColumn: ["rank"],
      });
      if (paginationRes.isErr()) {
        return apiError(
          req,
          res,
          {
            status_code: 400,
            api_error: {
              type: "invalid_pagination_parameters",
              message: "Invalid pagination parameters",
            },
          },
          paginationRes.error
        );
      }

      const useNewResponseFormat = req.query.newResponseFormat === "1";

      // Note that we don't use the order column and order direction here because we enforce sorting by rank in descending order.
      const messagesRes = await fetchConversationMessages(auth, {
        conversationId,
        limit: paginationRes.value.limit,
        lastRank: paginationRes.value.lastValue,
        viewType: useNewResponseFormat ? "light" : "legacy-light",
      });

      if (messagesRes.isErr()) {
        return apiErrorForConversation(req, res, messagesRes.error);
      }

      const messageLatency = performance.now() - messageStartTime;

      getStatsDClient().distribution(
        "assistant.messages.fetch.latency",
        messageLatency
      );
      const rawSize = Buffer.byteLength(
        JSON.stringify(messagesRes.value),
        "utf8"
      );
      getStatsDClient().distribution(
        "assistant.messages.fetch.raw_size",
        rawSize
      );

      res.status(200).json(messagesRes.value);
      break;

    case "POST":
      const bodyValidation = InternalPostMessagesRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { content, context, mentions, skipToolsValidation } =
        bodyValidation.right;

      if (context.clientSideMCPServerIds) {
        const hasServerAccess = await concurrentExecutor(
          context.clientSideMCPServerIds,
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
              message:
                "User does not have access to the client-side MCP servers.",
            },
          });
        }
      }

      const conversationRes = await getConversation(auth, conversationId);

      if (conversationRes.isErr()) {
        return apiErrorForConversation(req, res, conversationRes.error);
      }

      const conversation = conversationRes.value;

      // Find all the contentFragments that are above the user message.
      // Messages may have multiple versions, so we need to return only the max version of each message.
      const allMessages = removeNulls(
        [...conversation.content].map((messages) => {
          if (messages.length === 0) {
            return null;
          }
          return messages.toSorted((a, b) => b.version - a.version)[0];
        })
      );

      // Iterate over all messages sorted by rank descending and collect content fragments until we find a user message
      const contentFragments: ContentFragmentType[] = [];
      for (const message of allMessages.toSorted((a, b) => b.rank - a.rank)) {
        if (isUserMessageType(message)) {
          break;
        }
        if (isContentFragmentType(message)) {
          contentFragments.push(message);
        }
      }

      // Derive origin: use explicitly provided origin, fall back to conversation metadata,
      // then default to "web".
      const origin =
        context.origin ??
        (isSidekickConversation(conversation.metadata)
          ? "agent_sidekick"
          : "web");

      const messageRes = await postUserMessage(auth, {
        conversation,
        content,
        mentions,
        context: {
          timezone: context.timezone,
          username: user.username,
          fullName: user.fullName(),
          email: user.email,
          profilePictureUrl: context.profilePictureUrl ?? user.imageUrl,
          origin,
          clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
        },
        skipToolsValidation: skipToolsValidation ?? false,
      });

      if (messageRes.isErr()) {
        return apiError(req, res, messageRes.error);
      }

      res.status(200).json({
        message: messageRes.value.userMessage,
        contentFragments,
        agentMessages: messageRes.value.agentMessages,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
