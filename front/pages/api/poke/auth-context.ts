import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { fetchUserFromSession } from "@app/lib/iam/users";
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

  // Fetch the actual user from the database
  const userResource = await fetchUserFromSession(session);
  if (!userResource) {
    return res.status(200).json({ user: null, isSuperUser: false });
  }

  // If we reach here, user is a superuser (withSessionAuthenticationForPoke checks this)
  return res.status(200).json({
    user: userResource.toJSON(),
    isSuperUser: true,
  });
}

export default withSessionAuthenticationForPoke(handler);
