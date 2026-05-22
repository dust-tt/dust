// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import type { MembershipsPaginationParams } from "@app/lib/resources/membership_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 150;

export type GetMembersResponseBody = {
  members: UserTypeWithWorkspaces[];
  total: number;
  nextPageUrl?: string;
};

const MembersPaginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_PAGE_LIMIT)
    .catch(DEFAULT_PAGE_LIMIT),
  orderColumn: z.literal("createdAt").catch("createdAt"),
  orderDirection: z.enum(["asc", "desc"]).catch("desc"),
  lastValue: z.coerce.number().optional().catch(undefined),
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
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only workspace admins can access the members list.",
          },
        });
      }

      const paginationRes = MembersPaginationSchema.safeParse(req.query);
      if (!paginationRes.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid pagination parameters: ${fromError(paginationRes.error).toString()}`,
          },
        });
      }

      const paginationParams = paginationRes.data;

      if (req.query.role && req.query.role === "admin") {
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
