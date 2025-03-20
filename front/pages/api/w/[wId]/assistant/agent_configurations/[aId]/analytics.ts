import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  agentMentionsCount,
  getAgentUsers,
} from "@app/lib/api/assistant/agent_usage";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  AgentConfigurationType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";
export type GetAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};
export type DeleteAgentConfigurationResponseBody = {
  success: boolean;
};

const GetAgentConfigurationsAnalyticsQuerySchema = t.type({
  period: t.string,
});

export type GetAgentConfigurationAnalyticsResponseBody = {
  users: {
    user: UserType | undefined;
    count: number;
    timePeriodSec: number;
  }[];
  mentions: {
    messageCount: number;
    conversationCount: number;
    timePeriodSec: number;
  };
  feedbacks: {
    positiveFeedbacks: number;
    negativeFeedbacks: number;
    timePeriodSec: number;
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentConfigurationAnalyticsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const assistant = await getAgentConfiguration(
    auth,
    req.query.aId as string,
    "light"
  );

  if (
    !assistant ||
    (assistant.scope === "private" &&
      assistant.versionAuthorId !== auth.user()?.id)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  if (assistant.scope === "workspace" && !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message: "Only builders can get agent analytics.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation = GetAgentConfigurationsAnalyticsQuerySchema.decode(
        req.query
      );
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
      const period = parseInt(queryValidation.right.period);

      const owner = auth.getNonNullableWorkspace();
      const agentUsers = await getAgentUsers(owner, assistant, period);
      const users = await UserResource.fetchByModelIds(
        agentUsers.map((r) => r.userId)
      );

      const feedbacks =
        await AgentMessageFeedbackResource.getFeedbackCountForAssistants(
          auth,
          [assistant.sId],
          period
        );
      const positiveFeedbacks =
        feedbacks.find((f) => f.thumbDirection === "up")?.count ?? 0;
      const negativeFeedbacks =
        feedbacks.find((f) => f.thumbDirection === "down")?.count ?? 0;

      const mentionCounts = (
        await agentMentionsCount(owner.id, assistant, period)
      )[0];

      return res.status(200).json({
        users: agentUsers
          .map((r) => ({
            user: users.find((u) => u.id === r.userId)?.toJSON(),
            count: r.messageCount,
            timePeriodSec: r.timePeriodSec,
          }))
          .filter((r) => r.user),
        mentions: {
          messageCount: mentionCounts?.messageCount ?? 0,
          conversationCount: mentionCounts?.conversationCount ?? 0,
          timePeriodSec: mentionCounts?.timePeriodSec ?? period * 60 * 60 * 24,
        },
        feedbacks: {
          positiveFeedbacks,
          negativeFeedbacks,
          timePeriodSec: period * 60 * 60 * 24,
        },
      });
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
