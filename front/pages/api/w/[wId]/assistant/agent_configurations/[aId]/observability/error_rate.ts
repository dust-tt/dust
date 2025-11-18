import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { MessageMetricsPoint } from "@app/lib/api/assistant/observability/messages_metrics";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional(),
  version: z.string().optional(),
});

export type GetErrorRateResponse = {
  points: Pick<
    MessageMetricsPoint,
    "timestamp" | "count" | "failedMessages" | "errorRate"
  >[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetErrorRateResponse>>,
  auth: Authenticator
) {
  if (typeof req.query.aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

  const assistant = await getAgentConfiguration(auth, {
    agentId: req.query.aId,
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
        message: "Only editors can get agent observability.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
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

      const days = q.data.days ?? DEFAULT_PERIOD_DAYS;
      const version = q.data.version;

      const owner = auth.getNonNullableWorkspace();

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        agentId: assistant.sId,
        days,
        version,
      });

      const errorRateResult = await fetchMessageMetrics(baseQuery, "day", [
        "failedMessages",
        "errorRate",
      ] as const);

      if (errorRateResult.isErr()) {
        const e = errorRateResult.error;
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve error rate: ${e.message}`,
          },
        });
      }

      return res.status(200).json({
        points: errorRateResult.value,
      });
    }
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
