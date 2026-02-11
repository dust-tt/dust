import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type {
  ToolLatencyByVersion,
  ToolLatencyRow,
  ToolLatencyView,
} from "@app/lib/api/assistant/observability/tool_latency";
import {
  fetchToolLatencyMetrics,
  fetchToolLatencyMetricsByName,
} from "@app/lib/api/assistant/observability/tool_latency";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
  view: z.enum(["server", "tool"]).optional(),
  serverName: z.string().optional(),
});

export type GetToolLatencyResponse = {
  byVersion: ToolLatencyByVersion[];
  rows?: ToolLatencyRow[];
  view?: ToolLatencyView;
  serverName?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetToolLatencyResponse>>,
  auth: Authenticator
): Promise<void> {
  const { aId } = req.query;
  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
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

      const { days, version, view, serverName } = q.data;
      const owner = auth.getNonNullableWorkspace();

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        agentId: assistant.sId,
        days,
        version,
      });

      if (view) {
        if (view === "tool" && !serverName) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "serverName is required when view is tool.",
            },
          });
        }

        const toolLatencyResult = await fetchToolLatencyMetricsByName(
          baseQuery,
          {
            view,
            serverName,
          }
        );

        if (toolLatencyResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to retrieve tool latency metrics: ${fromError(toolLatencyResult.error).toString()}`,
            },
          });
        }

        return res.status(200).json({
          byVersion: [],
          rows: toolLatencyResult.value,
          view,
          serverName,
        });
      }

      const toolLatencyResult = await fetchToolLatencyMetrics(baseQuery);

      if (toolLatencyResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve tool latency metrics: ${fromError(toolLatencyResult.error).toString()}`,
          },
        });
      }

      return res.status(200).json({
        byVersion: toolLatencyResult.value,
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
