// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import { startManualCheckWorkflow } from "@app/temporal/production_checks/client";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type RunProductionCheckResponseBody = {
  workflowId: string;
  checkName: string;
};

const RunCheckRequestSchema = z.object({
  checkName: z.string(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<RunProductionCheckResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = RunCheckRequestSchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
      },
    });
  }

  const { checkName } = bodyValidation.data;

  const result = await startManualCheckWorkflow(checkName);
  if (result.isErr()) {
    const isUnknownCheck = result.error.message.startsWith("Unknown check:");
    return apiError(req, res, {
      status_code: isUnknownCheck ? 400 : 500,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  return res.status(200).json({ workflowId: result.value, checkName });
}

export default withSessionAuthenticationForPoke(handler);
