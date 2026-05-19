// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import type { GetMetronomeUsageResponse } from "@app/lib/api/analytics/metronome_usage";
import {
  getMetronomeUsage,
  getMetronomeUsageApiError,
  MetronomeUsageQuerySchema,
} from "@app/lib/api/analytics/metronome_usage";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMetronomeUsageResponse>>,
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

  const q = MetronomeUsageQuerySchema.safeParse(req.query);
  if (!q.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(q.error).toString()}`,
      },
    });
  }

  const result = await getMetronomeUsage(auth, q.data);
  if (result.isErr()) {
    return apiError(req, res, getMetronomeUsageApiError(result.error));
  }

  return res.status(200).json(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
