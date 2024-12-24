import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ feedbacks: AgentMessageFeedbackType[] }>
  >,
  auth: Authenticator
): Promise<void> {
  const { aId } = req.query;

  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `aId` (string) is required.",
      },
    });
  }

  // Make sure the agent configuration is accessible by the user
  const agentConfiguration = await getAgentConfiguration(auth, aId);
  if (!agentConfiguration) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const feedbacksRes = await getAgentFeedbacks({
        auth,
        agentConfigurationId: aId,
        withMetadata: req.query.withMetadata === "true",
        filters: {
          // Limit the number of feedbacks to retrieve.
          limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
          olderThan: req.query.olderThan
            ? new Date(req.query.olderThan as string)
            : undefined,
        },
      });

      if (feedbacksRes.isErr()) {
        return apiErrorForConversation(req, res, feedbacksRes.error);
      }

      const feedbacks = feedbacksRes.value;

      res.status(200).json({ feedbacks });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
