import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { UserTypeWithWorkspaces, WithAPIErrorResponse } from "@app/types";
import { sendUserOperationMessage } from "@app/types";
import { isJobType } from "@app/types/job_type";

export type PostUserMetadataResponseBody = {
  success: boolean;
};

const PatchUserBodySchema = t.type({
  firstName: t.string,
  lastName: t.string,
  jobType: t.union([t.string, t.undefined]),
  imageUrl: t.union([t.string, t.null, t.undefined]),
});

export type GetUserResponseBody = {
  user: UserTypeWithWorkspaces;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostUserMetadataResponseBody | GetUserResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  // This functions retrieves the full user including all workspaces.
  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      ServerSideTracking.trackGetUser({ user }).catch((err) => {
        logger.error(
          { err: err, userId: user.sId },
          "Failed to track user memberships"
        );
      });
      return res.status(200).json({ user });

    case "PATCH":
      const bodyValidation = PatchUserBodySchema.decode(req.body);
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

      const u = await UserResource.fetchByModelId(user.id);

      if (!u) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: "The user was not found.",
          },
        });
      }

      const workspace = user.workspaces[0];
      if (workspace?.role === "admin") {
        sendUserOperationMessage({
          message:
            `workspace_sid: ${workspace?.sId}; email: [${user.email}]; ` +
            `User Name [${user.firstName} ${user.lastName}].`,
          logger,
          channel: "C075LJ6PUFQ",
        }).catch((err) => {
          logger.error(
            { error: err },
            "Failed to send user operation message to Slack."
          );
        });
      }

      const firstName = bodyValidation.right.firstName.trim();
      const lastName = bodyValidation.right.lastName.trim();
      const jobType = bodyValidation.right.jobType?.trim();
      const imageUrl = bodyValidation.right.imageUrl;

      // Update user's name
      if (firstName.length === 0 || lastName.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "First name and last name cannot be empty.",
          },
        });
      }

      if (firstName !== user.firstName || lastName !== user.lastName) {
        // Provisioned users cannot update their name.
        if (user.origin === "provisioned") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Cannot update name for provisioned users.",
            },
          });
        }

        await u.updateName(firstName, lastName);
      }

      if (imageUrl && imageUrl !== user.image) {
        await u.updateImage(imageUrl);
      }

      // Update user's jobType
      if (jobType !== undefined && !isJobType(jobType)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Job type is invalid.",
          },
        });
      }

      // metadata + for loop allows for
      // more metadata to be processed thru
      // endpoint in future
      const metadata = {
        job_type: jobType,
      };

      for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined) {
          await u.setMetadata(key, String(value));
        }
      }

      await ServerSideTracking.trackUpdateUser({
        user: user,
        workspace: renderLightWorkspaceType({ workspace }),
        role: workspace.role !== "none" ? workspace.role : "user",
        jobType,
      });

      res.status(200).json({
        success: true,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthentication(handler);
