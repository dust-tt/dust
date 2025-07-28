import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  AgentMessageType,
  ContentFragmentType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@app/types";
import { isString, Ok } from "@app/types";

const ConversationsMessagesRunStepsRetrySchema = t.type({
  retryBlockedToolsOnly: t.boolean,
});

export type ConversationsMessagesRunStepsRetryResponseBody = Record<
  string,
  never
>;
/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ConversationsMessagesRunStepsRetryResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { cId, mId, stepIndex: stepIndexParam } = req.query;

  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid conversation ID",
      },
    });
  }

  if (!isString(mId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid message ID",
      },
    });
  }

  if (!isString(stepIndexParam)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid step index",
      },
    });
  }

  const stepIndexStr = stepIndexParam;

  const stepIndex = parseInt(stepIndexStr, 10);
  if (isNaN(stepIndex) || stepIndex < 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "stepIndex must be a valid non-negative integer",
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }
  const conversation = conversationRes.value;

  let messageAnyType:
    | AgentMessageType
    | UserMessageType
    | ContentFragmentType
    | undefined;
  for (const messages of conversation.content) {
    messageAnyType = messages.find((item) => item.sId === mId);
    if (messageAnyType) {
      break;
    }
  }

  if (!messageAnyType) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: `Message ${mId} not found in conversation ${cId}`,
      },
    });
  }
  if (messageAnyType.type !== "agent_message") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Message ${mId} is not an agent message`,
      },
    });
  }
  const agentMessage = messageAnyType;

  switch (req.method) {
    case "POST":
      const bodyValidation = ConversationsMessagesRunStepsRetrySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}.`,
          },
        });
      }
      // TODO(DURABLE-AGENTS 2025-07-21): Use step index, version and retryBlockedToolsOnly.
      // const result = await launchAgentLoopWorkflow();
      logger.info("endpoint called", {
        cId,
        mId,
        agentMessage,
      });
      const result = new Ok({});

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to launch workflow",
          },
        });
      }

      return res.status(200).json(result.value);

    default:
      res.status(405).end();
      return;
  }
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { POST: "update:conversation" },
});
