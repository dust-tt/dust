import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { statsDClient } from "@app/logger/statsDClient";
import { apiError } from "@app/logger/withlogging";
import type {
  AgentMessageType,
  ContentFragmentType,
  FetchConversationMessagesResponse,
  UserMessageType,
  WithAPIErrorResponse,
} from "@app/types";
import {
  InternalPostMessagesRequestBodySchema,
  isContentFragmentType,
  isUserMessageType,
  removeNulls,
} from "@app/types";
import { ExecutionModeSchema } from "@app/types/assistant/agent_run";

export type PostMessagesResponseBody = {
  message: UserMessageType;
  contentFragments: ContentFragmentType[];
  agentMessages: AgentMessageType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostMessagesResponseBody | FetchConversationMessagesResponse
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

  const executionModeParseResult = ExecutionModeSchema.safeParse(
    req.query.execution
  );

  // TODO(pr) remove in follow-up PR
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const executionMode = executionModeParseResult.success
    ? executionModeParseResult.data
    : undefined;

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

      const messagesRes = await fetchConversationMessages(
        auth,
        conversationId,
        paginationRes.value
      );

      if (messagesRes.isErr()) {
        return apiErrorForConversation(req, res, messagesRes.error);
      }

      const messageLatency = performance.now() - messageStartTime;

      statsDClient.distribution(
        "assistant.messages.fetch.latency",
        messageLatency
      );
      const rawSize = Buffer.byteLength(
        JSON.stringify(messagesRes.value),
        "utf8"
      );
      statsDClient.distribution("assistant.messages.fetch.raw_size", rawSize);

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

      const { content, context, mentions } = bodyValidation.right;

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
          origin: "web",
          clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
        },
        // For now we never skip tools when interacting with agents from the web client.
        skipToolsValidation: false,
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
