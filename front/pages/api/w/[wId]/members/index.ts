import type {
  LightUserType,
  UserTypeWithWorkspaces,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getPaginationParams } from "@app/lib/api/pagination";
import { getMembers, getMembersLight } from "@app/lib/api/workspace";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

const DEFAULT_PAGE_LIMIT = 50;

export type GetMembersResponseBody<T extends boolean> = {
  members: T extends true ? LightUserType[] : UserTypeWithWorkspaces[];
  total: number;
};

async function handler<T extends boolean>(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMembersResponseBody<T>>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const paginationRes = getPaginationParams(req, {
        defaultLimit: DEFAULT_PAGE_LIMIT,
        defaultOrderColumn: "createdAt",
        defaultOrderDirection: "desc",
        supportedOrderColumn: ["createdAt"],
      });

      const returnLight = req.query.light;

      if (typeof returnLight !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Parameter 'light' needs to be a string",
          },
        });
      }

      if (paginationRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: paginationRes.error.message,
          },
        });
      }

      const paginationParams = paginationRes.value;

      if (auth.isBuilder() && req.query.role && req.query.role === "admin") {
        const { members, total } = returnLight
          ? await getMembersLight(auth, {
              roles: ["admin"],
            })
          : await getMembers(
              auth,
              {
                roles: ["admin"],
              },
              paginationParams
            );
        res.status(200).json({
          members,
          total,
        } as GetMembersResponseBody<T>);
        return;
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

      const { members, total } = returnLight
        ? await getMembersLight(auth, {})
        : await getMembers(auth, {}, paginationParams);

      res.status(200).json({
        members,
        total,
      } as GetMembersResponseBody<T>);
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

export default withSessionAuthenticationForWorkspace(handler);
