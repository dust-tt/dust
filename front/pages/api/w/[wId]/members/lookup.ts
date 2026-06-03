// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { UserType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const MEMBERS_LOOKUP_MAX_IDS = 50;

const MembersLookupQuerySchema = z.object({
  ids: z.union([z.coerce.number(), z.array(z.coerce.number())]),
});

export type LightLookupUserType = Pick<
  UserType,
  "sId" | "id" | "firstName" | "lastName" | "fullName" | "image"
>;

export type MembersLookupResponseBody = {
  users: LightLookupUserType[];
};

export type MembersLookupAdminResponseBody = {
  users: UserType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      MembersLookupResponseBody | MembersLookupAdminResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const queryValidation = MembersLookupQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The query parameter `ids` is required.",
          },
        });
      }

      const rawIds = queryValidation.data.ids;
      const ids = Array.isArray(rawIds) ? rawIds : [rawIds];

      if (ids.length === 0) {
        return res.status(200).json({ users: [] });
      }

      if (ids.length > MEMBERS_LOOKUP_MAX_IDS) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Too many ids provided. Maximum is ${MEMBERS_LOOKUP_MAX_IDS}.`,
          },
        });
      }

      const uniqueIds = Array.from(new Set(ids));
      const users = await UserResource.fetchByModelIds(uniqueIds);

      if (users.length === 0) {
        return res.status(200).json({ users: [] });
      }

      const owner = auth.getNonNullableWorkspace();

      const { memberships } = await MembershipResource.getLatestMemberships({
        users,
        workspace: owner,
      });

      const validUserIds = new Set(memberships.map((m) => m.userId));
      const filteredUsers = users.filter((user) => validUserIds.has(user.id));

      // Non-admins get a response with sensitive fields (email, provider, lastLoginAt etc) stripped away.
      if (auth.isAdmin()) {
        return res.status(200).json({
          users: filteredUsers.map((user) => user.toJSON()),
        });
      }

      return res.status(200).json({
        users: filteredUsers.map((user) => ({
          sId: user.sId,
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName(),
          image: user.imageUrl,
        })),
      });
    }

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
