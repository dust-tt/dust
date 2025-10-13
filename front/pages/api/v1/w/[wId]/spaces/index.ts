import type { GetSpacesResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceType, WithAPIErrorResponse } from "@app/types";

type LegacySpacesResponseBody = {
  vaults: SpaceType[];
};

/**
 * @swagger
 * /api/v1/w/{wId}/spaces:
 *   get:
 *     summary: List available spaces.
 *     description: Retrieves a list of accessible spaces for the authenticated workspace.
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
 *     responses:
 *       200:
 *         description: Spaces of the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spaces:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Space'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSpacesResponseType | LegacySpacesResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const allSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);

      // conversations space should not be shown
      const spaces = allSpaces.filter(
        (space) => space.kind !== "conversations"
      );

      const isLegacyRequest = req.url?.includes("/vaults");
      if (isLegacyRequest) {
        res.status(200).json({
          vaults: spaces.map((space) => space.toJSON()),
        });
      }

      res.status(200).json({
        spaces: spaces.map((space) => space.toJSON()),
      });
      return;

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
