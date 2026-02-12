import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";

const PostSpaceRequestBodySchema = t.intersection([
  t.type({
    isRestricted: t.boolean,
    name: t.string,
    spaceKind: t.union([t.literal("regular"), t.literal("project")]),
  }),
  t.union([
    t.type({
      memberIds: t.array(t.string),
      managementMode: t.literal("manual"),
    }),
    t.type({
      groupIds: t.array(t.string),
      managementMode: t.literal("group"),
    }),
  ]),
]);

export type PostSpaceRequestBodyType = t.TypeOf<
  typeof PostSpaceRequestBodySchema
>;

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

      // Fetch project metadata for project spaces to include description
      const spacesWithDescriptions = await Promise.all(
        spaces.map(async (space) => {
          const spaceJson = space.toJSON();
          if (space.kind !== "project") {
            return spaceJson;
          }

          if (space.isProject()) {
            const projectMetadata = await ProjectMetadataResource.fetchBySpace(
              auth,
              space
            );
            if (projectMetadata) {
              spaceJson.description = projectMetadata.description ?? undefined;
            }
          }
          return spaceJson;
        })
      );

      return res.status(200).json({
        spaces: spacesWithDescriptions,
      });

    case "POST":
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

      const requestBody = bodyValidation.right;

      const spaceRes = await createSpaceAndGroup(auth, requestBody);
      if (spaceRes.isErr()) {
        switch (spaceRes.error.code) {
          case "limit_reached":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "plan_limit_error",
                message:
                  "Limit of spaces allowed for your plan reached. Contact support to upgrade.",
              },
            });
          case "space_already_exists":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "space_already_exists",
                message: "Space with that name already exists.",
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: spaceRes.error.message,
              },
            });
          case "unauthorized":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Only users that are `admins` can create regular spaces.",
              },
            });
          default:
            assertNever(spaceRes.error.code);
        }
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
