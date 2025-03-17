import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { createRegularSpaceAndGroup } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SpaceType, WithAPIErrorResponse } from "@app/types";
import { PostSpaceRequestBodySchema } from "@app/types";

export type GetSpacesResponseBody = {
  spaces: SpaceType[];
};

export type PostSpacesResponseBody = {
  space: SpaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSpacesResponseBody | PostSpacesResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const { role, kind } = req.query;

      if (
        (role && typeof role !== "string") ||
        (kind && typeof kind !== "string")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request query parameters.",
          },
        });
      }

      let spaces: SpaceResource[] = [];

      if (role && role === "admin") {
        if (!auth.isAdmin()) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Only users that are `admins` can see all spaces in the workspace.",
            },
          });
        }
        if (kind && kind === "system") {
          const systemSpace =
            await SpaceResource.fetchWorkspaceSystemSpace(auth);
          spaces = systemSpace ? [systemSpace] : [];
        } else {
          spaces = await SpaceResource.listWorkspaceSpaces(auth);
        }
      } else {
        spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
      }

      // Filter out conversations space
      spaces = spaces.filter((s) => s.kind !== "conversations");

      return res.status(200).json({
        spaces: spaces.map((s) => s.toJSON()),
      });

    case "POST":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users that are `admins` can administrate spaces.",
          },
        });
      }
      const bodyValidation = PostSpaceRequestBodySchema.decode(req.body);

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

      const spaceRes = await createRegularSpaceAndGroup(
        auth,
        bodyValidation.right
      );
      if (spaceRes.isErr()) {
        if (spaceRes.error instanceof DustError) {
          if (spaceRes.error.code === "limit_reached") {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "The maximum number of spaces has been reached.",
              },
            });
          }

          if (spaceRes.error.code === "space_already_exists") {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "space_already_exists",
                message: "This space name is already used.",
              },
            });
          }
        }

        logger.error(
          {
            error: spaceRes.error,
          },
          "The space cannot be created"
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The space cannot be created.",
          },
        });
      }

      return res.status(201).json({ space: spaceRes.value.toJSON() });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
