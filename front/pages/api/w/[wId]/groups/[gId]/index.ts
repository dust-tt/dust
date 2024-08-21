import type { GroupType, UserType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchGroupRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";

export type GetGroupResponseBody = {
  group: GroupType & {
    members: UserType[];
  };
};

export type PatchGroupResponseBody = {
  group: GroupType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetGroupResponseBody | PatchGroupResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const { gId } = req.query;

  if (typeof gId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "group_not_found",
        message: "The group you requested was not found.",
      },
    });
  }

  const group = await GroupResource.fetchById(auth, gId);
  // Check if the user has access to the group to get members list
  if (!group) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "group_not_found",
        message: "The group you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const members = await group.getActiveMembers(auth);
      if (
        !auth.isAdmin() &&
        !members.find((m) => m.id === auth.getNonNullableUser().id)
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only `admins` or members can get group info.",
          },
        });
      }
      return res.status(200).json({
        group: {
          ...group.toJSON(),
          members: members.map((member) => member.toJSON()),
        },
      });
    case "PATCH":
      if (!auth.isAdmin()) {
        // Only admins can patch
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users that are `admins` can administrate groups.",
          },
        });
      }
      const bodyValidation = PatchGroupRequestBodySchema.decode(req.body);

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { memberIds } = bodyValidation.right;

      if (memberIds) {
        const users = (await UserResource.fetchByIds(memberIds)).map((user) =>
          user.toJSON()
        );
        await group.setMembers(auth, users);
      }

      return res.status(200).json({ group: group.toJSON() });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
