import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { ToolExecutionByVersion } from "@app/lib/api/assistant/observability/tool_execution";
import { fetchToolExecutionMetrics } from "@app/lib/api/assistant/observability/tool_execution";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const DEFAULT_PERIOD = 30;

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional(),
});

export type GetToolExecutionResponse = {
  byVersion: ToolExecutionByVersion[];
};

function buildAgentAnalyticsBaseQuery(
  workspaceId: string,
  agentId: string,
  days: number
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { term: { agent_id: agentId } },
        { range: { timestamp: { gte: `now-${days}d/d` } } },
      ],
    },
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetToolExecutionResponse>>,
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

      const days = q.data.days ?? DEFAULT_PERIOD;
      const owner = auth.getNonNullableWorkspace();

      const baseQuery = buildAgentAnalyticsBaseQuery(
        owner.sId,
        assistant.sId,
        days
      );

      const toolExecutionResult = await fetchToolExecutionMetrics(baseQuery);

      if (toolExecutionResult.isErr()) {
        const e = toolExecutionResult.error;
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve tool execution metrics: ${e.message}`,
          },
        });
      }

      return res.status(200).json({
        byVersion: toolExecutionResult.value,
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
