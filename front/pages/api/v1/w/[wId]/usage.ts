import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getConversationsDataRetention } from "@app/lib/data_retention";
import { unsafeGetUsageData } from "@app/lib/workspace_usage";
import { getWorkspaceUsageRetentionErrorMessage } from "@app/lib/workspace_usage_retention";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { GetWorkspaceUsageResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD" });

const GetWorkspaceUsageSchema = z.object({
  start_date: DateString,
  end_date: DateString.nullish(),
});

/**
 * @ignoreswagger
 * Deprecated: this endpoint will be removed after 2026-06-01.
 * Use GET /api/v1/w/{wId}/analytics/export instead.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceUsageResponseType>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(auth);
  if (!flags.includes("usage_data_api")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The workspace does not have access to the usage data API.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation = GetWorkspaceUsageSchema.safeParse(req.query);
      if (!queryValidation.success) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request query: ${fromError(queryValidation.error).toString()}`,
          },
          status_code: 400,
        });
      }

      const query = queryValidation.data;
      const startDate = new Date(query.start_date);
      const endDate = query.end_date ? new Date(query.end_date) : new Date();
      const conversationsRetentionDays =
        await getConversationsDataRetention(auth);
      const retentionErrorMessage = getWorkspaceUsageRetentionErrorMessage({
        startDate,
        retentionDays: conversationsRetentionDays,
      });
      if (retentionErrorMessage) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: retentionErrorMessage,
          },
        });
      }

      const csvData = await unsafeGetUsageData(startDate, endDate, owner);
      res.setHeader("Content-Type", "text/csv");
      res.status(200).send(csvData);
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

export default withPublicAPIAuthentication(handler);
