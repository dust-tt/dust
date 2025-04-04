import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { NumberFromString, withFallback } from "io-ts-types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import type { MembershipsPaginationParams } from "@app/lib/resources/membership_resource";
import { apiError } from "@app/logger/withlogging";
import type { UserTypeWithWorkspaces, WithAPIErrorResponse } from "@app/types";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 150;

export type GetMembersResponseBody = {
  members: UserTypeWithWorkspaces[];
  total: number;
  nextPageUrl?: string;
};

const MembersPaginationCodec = t.type({
  limit: withFallback(
    t.refinement(
      NumberFromString,
      (n): n is number => n >= 0 && n <= MAX_PAGE_LIMIT,
      `LimitWithRange`
    ),
    DEFAULT_PAGE_LIMIT
  ),
  orderColumn: withFallback(t.literal("createdAt"), "createdAt"),
  orderDirection: withFallback(
    t.union([t.literal("asc"), t.literal("desc")]),
    "desc"
  ),
  lastValue: withFallback(
    t.union([NumberFromString, t.null, t.undefined]),
    undefined
  ),
});

const buildUrlWithParams = (
  req: NextApiRequest,
  newParams: MembershipsPaginationParams | undefined
) => {
  if (!newParams) {
    return undefined;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  Object.entries(newParams).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value.toString());
    }
  });
  return url.pathname + url.search;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMembersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const paginationRes = MembersPaginationCodec.decode(req.query);
      if (isLeft(paginationRes)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid pagination parameters",
          },
        });
      }

      const paginationParams = paginationRes.right;

      if (auth.isBuilder() && req.query.role && req.query.role === "admin") {
        const { members, total, nextPageParams } = await getMembers(
          auth,
          {
            roles: ["admin"],
            activeOnly: true,
          },
          paginationParams
        );

        return res.status(200).json({
          members,
          total,
          nextPageUrl: buildUrlWithParams(req, nextPageParams),
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

      const { members, total, nextPageParams } = await getMembers(
        auth,
        { activeOnly: true },
        paginationParams
      );
      return res.status(200).json({
        members,
        total,
        nextPageUrl: buildUrlWithParams(req, nextPageParams),
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
