import { NextApiRequest, NextApiResponse } from "next";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import { UserType } from "@app/types/user";

export type GetMembersResponseBody = {
  members: UserType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetMembersResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can see memberships or modify it.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const members = await getMembers(auth);

      res.status(200).json({ members });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
