import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { formatValidationErrors } from "io-ts-reporters";
import { NumberFromString, withFallback } from "io-ts-types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { searchMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { apiError } from "@app/logger/withlogging";
import type { UserTypeWithWorkspaces, WithAPIErrorResponse } from "@app/types";

const DEFAULT_PAGE_LIMIT = 25;

const SearchMembersQueryCodec = t.type({
  orderColumn: withFallback(t.literal("name"), "name"),
  orderDirection: withFallback(
    t.union([t.literal("asc"), t.literal("desc")]),
    "desc"
  ),
  offset: withFallback(NumberFromString, 0),
  limit: withFallback(
    t.refinement(
      NumberFromString,
      (n): n is number => n >= 0 && n <= 150,
      `LimitWithRange`
    ),
    DEFAULT_PAGE_LIMIT
  ),
  searchTerm: t.union([t.string, t.undefined]),
  searchEmails: t.union([t.string, t.undefined]),
});

export type SearchMembersResponseBody = {
  members: UserTypeWithWorkspaces[];
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
      const queryRes = SearchMembersQueryCodec.decode(req.query);

      if (isLeft(queryRes)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid query parameters: " +
              formatValidationErrors(queryRes.left).join(", "),
          },
        });
      }

      const query = queryRes.right;
      const emails = query.searchEmails?.split(",");
      if (emails?.length && emails.length > MAX_SEARCH_EMAILS) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Too many emails provided. Maximum is ${MAX_SEARCH_EMAILS}.`,
          },
        });
      }

      const { members, total } = await searchMembers(
        auth,
        {
          searchTerm: query.searchTerm,
          searchEmails: emails,
        },
        query
      );

      return res.status(200).json({
        members,
        total,
      });

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
