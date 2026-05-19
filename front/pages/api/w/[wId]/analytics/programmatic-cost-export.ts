// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import {
  ExportQuerySchema,
  getProgrammaticCostExport,
} from "@app/lib/api/analytics/programmatic_cost_export";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const q = ExportQuerySchema.safeParse(req.query);
  if (!q.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${q.error.message}`,
      },
    });
  }

  const result = await getProgrammaticCostExport(auth, q.data);

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: result.error.status,
      api_error: result.error.error,
    });
  }

  const { csv, filename } = result.value;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.status(200).send(csv);
}

export default withSessionAuthenticationForWorkspace(handler);
