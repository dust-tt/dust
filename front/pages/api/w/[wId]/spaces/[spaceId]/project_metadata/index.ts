import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { ProjectMetadataType, WithAPIErrorResponse } from "@app/types";

export type GetProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType | null;
};

export type PostProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType;
};

const PostProjectMetadataRequestBodySchema = t.type({
  status: t.union([
    t.literal("active"),
    t.literal("paused"),
    t.literal("completed"),
    t.literal("archived"),
  ]),
  description: t.union([t.string, t.null]),
  tags: t.union([t.array(t.string), t.null]),
  externalLinks: t.union([
    t.array(
      t.type({
        title: t.string,
        url: t.string,
      })
    ),
    t.null,
  ]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectMetadataResponseBody | PostProjectMetadataResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  switch (req.method) {
    case "GET": {
      if (!space.canRead(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You do not have permission to access this project.",
          },
        });
      }

      const metadata = await ProjectMetadataResource.fetchBySpace(auth, {
        space,
      });

      return res.status(200).json({
        projectMetadata: metadata ? metadata.toJSON() : null,
      });
    }

    case "POST": {
      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "You do not have permission to edit this project's metadata.",
          },
        });
      }

      const bodyValidation = PostProjectMetadataRequestBodySchema.decode(
        req.body
      );
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

      const { status, description, tags, externalLinks } = bodyValidation.right;

      // Check if metadata already exists.
      let metadata = await ProjectMetadataResource.fetchBySpace(auth, {
        space,
      });

      if (metadata) {
        // Update existing metadata.
        const updateResult = await metadata.updateMetadata(auth, {
          status,
          description,
          tags,
          externalLinks,
        });

        if (updateResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to update project metadata.",
            },
          });
        }

        metadata = updateResult.value;
      } else {
        // Create new metadata.
        metadata = await ProjectMetadataResource.makeNew(auth, {
          space,
          status,
          description,
          tags,
          externalLinks,
        });
      }

      return res.status(200).json({
        projectMetadata: metadata.toJSON(),
      });
    }

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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
