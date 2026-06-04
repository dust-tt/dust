// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { searchMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { GROUP_KINDS } from "@app/types/groups";
import type { LightUserType, UserTypeWithWorkspace } from "@app/types/user";
import { toLightUser } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const DEFAULT_PAGE_LIMIT = 25;

const SearchMembersQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(0).max(150).catch(DEFAULT_PAGE_LIMIT),
  searchTerm: z.string().optional(),
  searchEmails: z.string().optional(),
  groupKind: z.enum(GROUP_KINDS).exclude(["system"]).optional(),
  buildersOnly: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type SearchMembersResponseBody = {
  members: LightUserType[];
  total: number;
};

export type SearchMembersAdminResponseBody = {
  members: UserTypeWithWorkspace[];
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      SearchMembersResponseBody | SearchMembersAdminResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const queryRes = SearchMembersQuerySchema.safeParse(req.query);

      if (!queryRes.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${fromError(queryRes.error).toString()}`,
          },
        });
      }

      const query = queryRes.data;
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
          groupKind: query.groupKind,
          buildersOnly: query.buildersOnly,
        },
        query
      );

      // Non-admins get a response with sensitive fields (email, provider, lastLoginAt etc) stripped away.
      if (auth.isAdmin()) {
        return res.status(200).json({ members, total });
      }

      return res.status(200).json({
        members: members.map(toLightUser),
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
