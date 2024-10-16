import type { ValidateMemberResponseType } from "@dust-tt/client";
import { ValidateMemberRequestSchema } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";

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
        message: `Invalid request body: ${r.error.message}`,
      },
    });
  }

  const { email } = r.data;

  switch (req.method) {
    case "POST":
      const user = await UserResource.fetchByEmail(email);

      const workspace = auth.getNonNullableWorkspace();

      if (!user) {
        return res.status(200).json({
          valid: false,
        });
      }

      const workspaceMembership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace,
        });

      const valid = !!workspaceMembership;

      return res.status(200).json({
        valid,
      });

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
