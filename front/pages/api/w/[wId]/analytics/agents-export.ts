/** @ignoreswagger */
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
} from "@app/lib/api/analytics/agents_export";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { stringify } from "csv-stringify/sync";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
) {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { days } = req.query;
      const q = QuerySchema.safeParse({ days });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const owner = auth.getNonNullableWorkspace();

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        days: q.data.days,
      });

      const result = await fetchAgentExportRows(baseQuery, owner);

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve agent analytics: ${result.error.message}`,
          },
        });
      }

      const csvData = result.value.map((row) =>
        AGENT_EXPORT_HEADERS.map((h) => row[h])
      );
      const csv = stringify([AGENT_EXPORT_HEADERS, ...csvData], {
        header: false,
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_agents_last_${q.data.days}_days.csv"`
      );
      return res.status(200).send(csv);
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
