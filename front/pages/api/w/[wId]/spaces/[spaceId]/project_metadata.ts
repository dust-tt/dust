import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { ProjectMetadataType, WithAPIErrorResponse } from "@app/types";
import { PatchProjectMetadataBodySchema } from "@app/types";

export type GetProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType | null;
};

export type PatchProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectMetadataResponseBody | PatchProjectMetadataResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  // Only project spaces can have metadata
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Project metadata is only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      return res.status(200).json({
        projectMetadata: metadata ? metadata.toJSON() : null,
      });
    }

    case "PATCH": {
      if (!space.canAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only admins can update project metadata.",
          },
        });
      }

      const bodyValidation = PatchProjectMetadataBodySchema.decode(req.body);
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

      const body = bodyValidation.right;

      let metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

      if (!metadata) {
        // Create new metadata
        metadata = await ProjectMetadataResource.makeNew(auth, space, {
          description: body.description ?? null,
          urls: body.urls ?? [],
          tags: body.tags ?? [],
        });
      } else {
        // Update existing metadata
        await metadata.updateMetadata(body);
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
          message: "The method passed is not supported, GET or PATCH expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
