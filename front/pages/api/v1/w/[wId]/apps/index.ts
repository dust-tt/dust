import handler from "@app/pages/api/v1/w/[wId]/vaults/[vId]/apps";

/**
 * @swagger
 * /api/v1/w/{wId}/apps:
 *   get:
 *     summary: List apps
 *     description: Get all apps of a workspace.
 *     tags:
 *       - Apps
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
 *         description: Apps of the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: Unique identifier for the app
 *                       sId:
 *                         type: string
 *                         description: Unique string identifier for the app
 *                       name:
 *                         type: string
 *                         description: Name of the app
 *                       description:
 *                         type: string
 *                         description: Description of the app
 *                       savedSpecification:
 *                         type: string
 *                         description: Saved specification of the app
 *                       savedConfig:
 *                         type: string
 *                         description: Saved configuration of the app
 *                       savedRun:
 *                         type: string
 *                         description: Saved run identifier of the app
 *                       dustAPIProjectId:
 *                         type: string
 *                         description: ID of the associated Dust API project
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

export default handler;
