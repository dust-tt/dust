import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceType, WithAPIErrorResponse } from "@app/types";
import { isString, PatchSpaceMembersRequestBodySchema } from "@app/types";

interface PatchSpaceMembersResponseBody {
  space: SpaceType;
}

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/members:
 *   patch:
 *     summary: Change the members in a space.
 *     description: Changes the list of members that have a specified space available to them.
 *     tags:
 *       - Spaces
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: Unique string identifier for the space
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   memberIds:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Array of user IDs to grant access to the space
 *                   isRestricted:
 *                     type: boolean
 *                     enum: [true]
 *                     description: Must be true for restricted spaces
 *                 required: [memberIds, isRestricted]
 *               - type: object
 *                 properties:
 *                   memberIds:
 *                     type: null
 *                     description: Must be null for unrestricted spaces
 *                   isRestricted:
 *                     type: boolean
 *                     enum: [false]
 *                     description: Must be false for unrestricted spaces
 *                 required: [memberIds, isRestricted]
 *     responses:
 *       200:
 *         description: Space updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 space:
 *                   $ref: '#/components/schemas/Space'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. Only admins can administrate space members.
 *       404:
 *         description: Space not found.
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchSpaceMembersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { spaceId } = req.query;

  if (!spaceId || !isString(spaceId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space was not found.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      if (!space.canAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` can administrate space members.",
          },
        });
      }

      const bodyValidation = PatchSpaceMembersRequestBodySchema.decode(
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

      const updateRes = await space.updatePermissions(
        auth,
        bodyValidation.right
      );
      if (updateRes.isErr()) {
        if (
          updateRes.error instanceof DustError &&
          updateRes.error.code === "unauthorized"
        ) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Only users that are `admins` can administrate space members.",
            },
          });
        } else {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateRes.error.message,
            },
          });
        }
      }

      return res.status(200).json({ space: space.toJSON() });
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

export default withPublicAPIAuthentication(handler);
