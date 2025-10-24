import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ success: true }>>,
  auth: Authenticator
): Promise<void> {
  const { aId, fId } = req.query;

  if (typeof aId !== "string" || typeof fId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `aId` (string) and `fId` (string) are required.",
      },
    });
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
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
    case "PATCH":
      const feedbackId = parseInt(fId, 10);
      if (isNaN(feedbackId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid feedback ID.",
          },
        });
      }

      const feedback = await AgentMessageFeedbackResource.fetchByFeedbackId(
        auth,
        feedbackId
      );
      if (!feedback) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The feedback was not found.",
          },
        });
      }

      if (feedback.agentConfigurationId !== aId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The feedback does not belong to this agent.",
          },
        });
      }

      const { dismissed } = req.body;
      if (typeof dismissed !== "boolean") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body, `dismissed` (boolean) is required.",
          },
        });
      }

      if (dismissed) {
        await feedback.dismiss();
      } else {
        await feedback.undismiss();
      }

      res.status(200).json({ success: true });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
