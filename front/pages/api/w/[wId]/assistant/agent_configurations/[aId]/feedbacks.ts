import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{
      feedbacks: AgentMessageFeedbackType[];
    }>
  >,
  auth: Authenticator
): Promise<void> {
  const { aId } = req.query;

  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `aId` (string) is required.",
      },
    });
  }

  // IMPORTANT: make sure the agent configuration is accessible by the user.
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
    case "GET":
      // asc id is equivalent to desc createdAt
      const paginationRes = getPaginationParams(req, {
        defaultLimit: 50,
        defaultOrderColumn: "id",
        defaultOrderDirection: "asc",
        supportedOrderColumn: ["id"],
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
      const { filter: filterParam, version: versionParam } = req.query;
      const filter = filterParam === "all" ? "all" : "active";
      const version = isString(versionParam)
        ? parseInt(versionParam, 10)
        : undefined;
      const feedbacksRes = await getAgentFeedbacks({
        auth,
        agentConfigurationId: aId,
        withMetadata: req.query.withMetadata === "true",
        paginationParams: paginationRes.value,
        filter,
        version: Number.isNaN(version) ? undefined : version,
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
