import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";

export type ValidateMemberResponseBody = {
  valid: boolean;
  userId?: number;
};

/**
 * @ignoreswagger
 * Validates an email corresponds to an active member in a specific workspace. For Dust managed apps only - undocumented.
 */

export const PostValidateMemberRequestBodySchema = t.type({
  email: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateMemberResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const bodyValidation = PostValidateMemberRequestBodySchema.decode(req.body);

  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { email } = bodyValidation.right;

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
        userId: user.id,
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
