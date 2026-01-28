import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { UserType, WithAPIErrorResponse } from "@app/types";

export type GetPokeAuthContextResponseType =
  | {
      user: UserType;
      isSuperUser: true;
    }
  | { user: null; isSuperUser: false };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPokeAuthContextResponseType>>,
  session: SessionWithUser
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

  const auth = await Authenticator.fromSuperUserSession(session, null);
  const userResource = auth.getNonNullableUser();

  // If we reach here, user is a superuser (withSessionAuthenticationForPoke checks this)
  return res.status(200).json({
    user: userResource.toJSON(),
    isSuperUser: true,
  });
}

export default withSessionAuthenticationForPoke(handler);
