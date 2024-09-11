import type { UserType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getPaginationParams } from "@app/lib/api/pagination";
import { searchMembers } from "@app/lib/api/workspace";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

const DEFAULT_PAGE_LIMIT = 25;

export type SearchMembersResponseBody = {
  members: UserType[];
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchMembersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can search memberships.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const { searchTerm, orderBy } = req.query;

      if (typeof searchTerm !== "string" || typeof orderBy !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid query parameters. Both 'searchTerm' and 'orderBy' must be strings.",
          },
        });
      }

      const paginationRes = getPaginationParams(req, {
        defaultLimit: DEFAULT_PAGE_LIMIT,
        defaultOrderColumn: orderBy || "name",
        defaultOrderDirection: "desc",
        supportedOrderColumn: ["name"],
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

      const { members, total } = await searchMembers(
        auth,
        {
          email: searchTerm,
        },
        paginationParams
      );

      res.status(200).json({
        members,
        total,
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
