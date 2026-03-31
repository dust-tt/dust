/** @ignoreswagger */

import { exportTable } from "@app/lib/api/analytics/export_tables";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { GetAnalyticsExportRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const flags = await getFeatureFlags(auth);
  if (!flags.includes("analytics_csv_export")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "The workspace does not have access to the analytics export API.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { table, startDate, endDate, timezone } = req.query;
      const q = GetAnalyticsExportRequestSchema.safeParse({
        table,
        startDate,
        endDate,
        timezone,
      });
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
      const csv = await exportTable({
        table: q.data.table,
        startDate: q.data.startDate,
        endDate: q.data.endDate,
        timezone: q.data.timezone ?? "UTC",
        owner,
      });

      if (csv.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: csv.error.message,
          },
        });
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_${q.data.table}_${q.data.startDate}_${q.data.endDate}.csv"`
      );
      return res.status(200).send(csv.value);
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

export default withPublicAPIAuthentication(handler);
