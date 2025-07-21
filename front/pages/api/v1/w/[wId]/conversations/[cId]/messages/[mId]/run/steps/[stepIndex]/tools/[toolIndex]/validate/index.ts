import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { apiError } from "@app/logger/withlogging";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = t.type({
  cId: t.string,
  mId: t.string,
  stepIndex: t.string,
  toolIndex: t.string,
});

const ConversationsMessagesRunStepsRetrySchema = t.type({
  validationState: t.boolean, // TODO(DURABLE-AGENTS 2025-07-21): Make this Execution state and not boolean
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
  >
): Promise<void> {
  const queryValidation = QuerySchema.decode(req.query);
  if (isLeft(queryValidation)) {
    const pathError = reporter.formatValidationErrors(queryValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${pathError}`,
      },
    });
  }

  const {
    cId: conversationId,
    mId: agentMessageIdStr,
    stepIndex: stepIndexStr,
    toolIndex: toolIndexStr,
  } = queryValidation.right;

  const agentMessageId = parseInt(agentMessageIdStr, 10);
  if (isNaN(agentMessageId) || agentMessageId < 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "agentMessageId must be a valid non-negative integer",
      },
    });
  }

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

  const toolIndex = parseInt(toolIndexStr, 10);
  if (isNaN(toolIndex) || toolIndex < 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "toolIndex must be a valid non-negative integer",
      },
    });
  }

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
      // TODO(DURABLE-AGENTS 2025-07-21): Use step index, version and retryBlockedToolsOnly
      const result = await launchAgentLoopWorkflow({
        agentMessageId,
        conversationId,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to launch workflow",
          },
        });
      }

      return res.status(200).json({});

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
