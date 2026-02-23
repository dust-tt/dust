import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { GroupKind, GroupType } from "@app/types/groups";
import { GroupKindCodec } from "@app/types/groups";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetGroupsResponseBody = {
  groups: GroupType[];
};

const GetGroupsQuerySchema = t.partial({
  kind: t.union([GroupKindCodec, t.array(GroupKindCodec)]),
  spaceId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetGroupsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const queryValidation = GetGroupsQuerySchema.decode(req.query);
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { kind, spaceId } = queryValidation.right;
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

      const groupsWithMemberCount = await Promise.all(
        groups.map((group) => group.toJSONWithMemberCount(auth))
      );

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
