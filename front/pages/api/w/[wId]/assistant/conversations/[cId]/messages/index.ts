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
import { getFeatureFlags } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { statsDClient } from "@app/logger/statsDClient";
import { apiError } from "@app/logger/withlogging";
import type {
  FetchConversationMessagesResponse,
  UserMessageType,
  WithAPIErrorResponse,
} from "@app/types";
import { InternalPostMessagesRequestBodySchema } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { message: UserMessageType } | FetchConversationMessagesResponse
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

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const hasAsyncLoopFeature = featureFlags.includes("async_loop");
  const forceAsynchronousLoop =
    req.query.async === "true" ||
    (req.query.async !== "false" && hasAsyncLoopFeature);

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
        forceAsynchronousLoop,
      });

      if (messageRes.isErr()) {
        return apiError(req, res, messageRes.error);
      }

      res.status(200).json({ message: messageRes.value.userMessage });
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
