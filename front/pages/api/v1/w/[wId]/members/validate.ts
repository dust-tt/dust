import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getMembers } from "@app/lib/api/workspace";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type ValidateMemberResponseBody = {
  valid: boolean;
};

/**
 * @ignoreswagger
 * Validates an email corresponds to an active member in a specific workspace. For Dust managed apps only - undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateMemberResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { email } = req.body;

  switch (req.method) {
    case "POST":
      const { members: allMembers } = await getMembers(auth, {
        activeOnly: true,
      });

      return res
        .status(200)
        .json({ valid: allMembers.some((member) => member.email === email) });

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
