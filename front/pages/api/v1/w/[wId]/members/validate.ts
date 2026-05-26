// @migration-status: MIGRATED_TO_HONO
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { hasActiveMemberByEmail } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ValidateMemberResponseType } from "@dust-tt/client";
import { ValidateMemberRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

/**
 * @ignoreswagger
 * Validates an email corresponds to an active member in a specific workspace. For Dust managed apps only - undocumented.
 */
async function handler(
  req: NextApiRequest,

  res: NextApiResponse<WithAPIErrorResponse<ValidateMemberResponseType>>,
  auth: Authenticator
): Promise<void> {
  const r = ValidateMemberRequestSchema.safeParse(req.body);

  if (r.error) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
    });
  }

  const { email } = r.data;

  switch (req.method) {
    case "POST":
      const valid = await hasActiveMemberByEmail({
        email,
        workspace: auth.getNonNullableWorkspace(),
      });

      return res.status(200).json({ valid });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
