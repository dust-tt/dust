import { NextApiRequest, NextApiResponse } from "next";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession, RoleType } from "@app/lib/auth";
import { Membership, User } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { UserType } from "@app/types/user";

export type PostMemberResponseBody = {
  member: UserType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostMemberResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner || owner.type !== "team") {
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

  let userId = parseInt(req.query.userId as string);
  if (isNaN(userId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  let [user, membership] = await Promise.all([
    User.findOne({
      where: {
        id: userId,
      },
    }),
    Membership.findOne({
      where: {
        userId: userId,
        workspaceId: owner.id,
      },
    }),
  ]);

  if (!user || !membership) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (
        !req.body ||
        !req.body.role ||
        !["admin", "builder", "user", "revoked"].includes(req.body.role)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request body is invalid, expects { role: string }.",
          },
        });
      }

      await membership.update({
        role: req.body.role,
      });

      let w = { ...owner };
      w.role = "none";

      switch (req.body.role) {
        case "admin":
        case "builder":
        case "user":
          w.role = req.body.role;
          break;
        default:
          w.role = "none";
      }

      const member = {
        id: user.id,
        provider: user.provider,
        providerId: user.providerId,
        username: user.username,
        email: user.email,
        name: user.name,
        image: null,
        workspaces: [w],
      };

      res.status(200).json({ member });
      return;

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

export default withLogging(handler);
