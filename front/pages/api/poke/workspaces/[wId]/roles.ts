import type { WithAPIErrorResponse } from "@dust-tt/types";
import { ActiveRoleSchema, assertNever } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getUserForWorkspace } from "@app/lib/api/user";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { apiError } from "@app/logger/withlogging";

export type PostRoleUserResponseBody = {
  success: true;
};

const PostRoleUserRequestBody = t.type({
  userId: t.string,
  role: ActiveRoleSchema,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostRoleUserResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostRoleUserRequestBody.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }
      const { userId, role } = bodyValidation.right;

      const user = await getUserForWorkspace(auth, { userId });
      if (!user) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: "Could not find the user.",
          },
        });
      }

      const updateRes = await MembershipResource.updateMembershipRole({
        user,
        workspace: owner,
        newRole: role,
        // We allow to re-activate a terminated membership when updating the role here.
        allowTerminated: true,
      });

      if (updateRes.isErr()) {
        switch (updateRes.error.type) {
          case "not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "workspace_user_not_found",
                message: "Could not find the membership.",
              },
            });
          case "membership_already_terminated":
            // This cannot happen because we allow updating terminated memberships
            // by setting `allowTerminated` to true.
            throw new Error("Unreachable.");
          case "already_on_role":
            // Should not happen, but we ignore.
            break;
          case "last_admin":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Cannot remove the last admin of a workspace.",
              },
            });
          default:
            assertNever(updateRes.error.type);
        }
      }

      if (updateRes.isOk()) {
        void ServerSideTracking.trackUpdateMembershipRole({
          user: user.toJSON(),
          workspace: owner,
          previousRole: updateRes.value.previousRole,
          role: updateRes.value.newRole,
        });
      }
      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthentication(handler);
