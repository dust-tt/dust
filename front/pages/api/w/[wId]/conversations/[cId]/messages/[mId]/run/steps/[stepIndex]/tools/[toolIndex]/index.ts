import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { apiError } from "@app/logger/withlogging";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { WithAPIErrorResponse } from "@app/types";
import type { AgentStepContentType } from "@app/types/assistant/agent_message_content";

const QuerySchema = t.intersection([
  t.type({
    cId: t.string,
    mId: t.string,
    stepIndex: t.string,
    toolIndex: t.string,
  }),
  t.partial({
    version: t.string,
  }),
]);

export type ConversationsMessagesRunStepsToolsResponseBody = {
  agentStepContent: AgentStepContentType | null;
};
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ConversationsMessagesRunStepsToolsResponseBody>
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
    version: versionStr,
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

  let version = 0;
  if (versionStr !== undefined) {
    version = parseInt(versionStr, 10);
    if (isNaN(version) || version < 0) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "version must be a valid non-negative integer or null",
        },
      });
    }
  }

  switch (req.method) {
    case "GET":
      // TODO(DURABLE-AGENTS 2025-07-21): Use step index, tool index and version
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

      return res.status(200).json({ agentStepContent: null });

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
