// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { GetGroupsResponseBody } from "@app/lib/api/groups";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { GroupKind } from "@app/types/groups";
import { GroupKindCodec } from "@app/types/groups";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const GetGroupsQuerySchema = z.object({
  kind: z.union([GroupKindCodec, z.array(GroupKindCodec)]).optional(),
  spaceId: z.string().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetGroupsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const queryValidation = GetGroupsQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        const pathError = fromError(queryValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { kind, spaceId } = queryValidation.data;
      const groupKinds: GroupKind[] = kind
        ? Array.isArray(kind)
          ? kind
          : [kind]
        : ["global", "regular", "space_editors"];

      let groups: GroupResource[];

      if (spaceId) {
        // Fetch groups associated with the specific space
        groups = await GroupResource.listForSpaceById(auth, spaceId, {
          groupKinds,
        });
      } else {
        // Fetch all workspace groups (existing behavior)
        groups = await GroupResource.listAllWorkspaceGroups(auth, {
          groupKinds,
        });
      }

      const memberCounts = await GroupResource.getMemberCountsForGroups(
        auth,
        groups
      );

      const groupsWithMemberCount = groups.map((group) => ({
        ...group.toJSON(),
        memberCount: memberCounts.get(group.id) ?? 0,
      }));

      return res.status(200).json({
        groups: groupsWithMemberCount,
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
