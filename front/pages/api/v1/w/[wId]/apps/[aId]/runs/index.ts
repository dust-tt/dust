import handler from "@app/pages/api/v1/w/[wId]/vaults/[vId]/apps/[aId]/runs";

/**
 * @swagger
 * /api/v1/w/{wId}/apps/{aId}/run:
 *   post:
 *     summary: Create an app run
 *     description: Create and execute a run for an app in the specified workspace.
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
 *       - in: path
 *         name: aId
 *         required: true
 *         description: Unique identifier of the app
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - specification_hash
 *               - config
 *               - inputs
 *             properties:
 *               specification_hash:
 *                 type: string
 *                 description: Hash of the app specification. Ensures API compatibility across app iterations.
 *               config:
 *                 type: object
 *                 description: Configuration for the app run
 *                 properties:
 *                   model:
 *                     type: object
 *                     description: Model configuration
 *                     properties:
 *                       provider_id:
 *                         type: string
 *                         description: ID of the model provider
 *                       model_id:
 *                         type: string
 *                         description: ID of the model
 *                       use_cache:
 *                         type: boolean
 *                         description: Whether to use caching
 *                       use_stream:
 *                         type: boolean
 *                         description: Whether to use streaming
 *               inputs:
 *                 type: array
 *                 description: Array of input objects for the app
 *                 items:
 *                   type: object
 *                   additionalProperties: true
 *               stream:
 *                 type: boolean
 *                 description: If true, the response will be streamed
 *               blocking:
 *                 type: boolean
 *                 description: If true, the request will block until the run is complete
 *               block_filter:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of block names to filter the response
 *     responses:
 *       200:
 *         description: App run created and executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 run:
 *                   $ref: '#/components/schemas/Run'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace or app not found.
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 */

export default handler;
