import type {
  UserTypeWithWorkspaces,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import type { PaginationParams } from "@app/lib/api/pagination";
import { getPaginationParams } from "@app/lib/api/pagination";
import { getMembers } from "@app/lib/api/workspace";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

const DEFAULT_PAGE_LIMIT = 50;

export type GetMembersResponseBody = {
  members: UserTypeWithWorkspaces[];
  paginationParams: PaginationParams;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMembersResponseBody>>,
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
        const members = await getMembers(
          auth,
          {
            roles: ["admin"],
          },
          paginationParams
        );
        res.status(200).json({
          members,
          paginationParams: {
            limit: paginationParams.limit,
            orderColumn: paginationParams.orderColumn,
            orderDirection: paginationParams.orderDirection,
          },
        });
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

      const members = await getMembers(auth, {}, paginationParams);

      res.status(200).json({
        members,
        paginationParams: {
          limit: paginationParams.limit,
          orderColumn: paginationParams.orderColumn,
          orderDirection: paginationParams.orderDirection,
        },
      });
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
