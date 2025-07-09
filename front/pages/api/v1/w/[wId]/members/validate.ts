import type { ValidateMemberResponseType } from "@dust-tt/client";
import { ValidateMemberRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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
      const users = await UserResource.listByEmail(email);
      const workspace = auth.getNonNullableWorkspace();

      if (!users.length) {
        return res.status(200).json({
          valid: false,
        });
      }

      // Check memberships for all users with this email until we find an active one
      for (const user of users) {
        const workspaceMembership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace,
          });

        if (workspaceMembership) {
          return res.status(200).json({
            valid: true,
          });
        }
      }

      return res.status(200).json({
        valid: false,
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
