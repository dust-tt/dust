import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { apiError } from "@app/logger/withlogging";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { AgentStepContentType } from "@app/types/assistant/agent_message_content";

export type ConversationsMessagesRunStepsResponseBody = {
  agentStepsContent: AgentStepContentType[];
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ConversationsMessagesRunStepsResponseBody>
  >
): Promise<void> {
  const {
    cId,
    mId,
    stepIndex: stepIndexParam,
    version: versionParam,
  } = req.query;

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

  const conversationId = cId;
  const agentMessageIdStr = mId;
  const stepIndexStr = stepIndexParam;
  const versionStr = versionParam;

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

  let version = 0;
  if (versionStr !== undefined) {
    if (!isString(versionStr)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "version must be a string",
        },
      });
    }
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
      // TODO(DURABLE-AGENTS 2025-07-21): Use step index and version
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

      return res.status(200).json({ agentStepsContent: [] });

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
