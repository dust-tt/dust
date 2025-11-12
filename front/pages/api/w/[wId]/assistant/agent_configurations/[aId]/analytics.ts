import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
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

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional(),
  version: z.string().optional(),
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
  const assistant = await getAgentConfiguration(auth, {
    agentId: req.query.aId as string,
    variant: "light",
  });

  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  if (!assistant.canEdit && !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Only editors can get agent analytics.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const q = QuerySchema.safeParse(req.query);
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }
      const period = q.data.days ?? DEFAULT_PERIOD_DAYS;
      const version = q.data.version;

      const owner = auth.getNonNullableWorkspace();

      // Build ES base query (filters workspace, agent, optional days + version)
      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        agentId: assistant.sId,
        days: period,
        version,
      });
      const overview = await fetchAgentOverview(baseQuery, period);
      if (overview.isErr()) {
        const e = overview.error;
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve agent analytics: ${e.message}`,
          },
        });
      }

      const {
        activeUsers,
        conversationCount,
        messageCount,
        positiveFeedbacks,
        negativeFeedbacks,
      } = overview.value;

      // We only use users.length in the UI. Populate with placeholders of the right length.
      const users = Array.from({ length: activeUsers }).map(() => ({
        user: undefined as UserType | undefined,
        count: 0,
        timePeriodSec: period * 60 * 60 * 24,
      }));

      return res.status(200).json({
        users,
        mentions: {
          messageCount,
          conversationCount,
          timePeriodSec: period * 60 * 60 * 24,
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
