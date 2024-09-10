import type { RunType } from "@dust-tt/types";

import handler from "@app/pages/api/v1/w/[wId]/vaults/[vId]/apps/[aId]/runs/[runId]";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

/**
 * @swagger
 * /api/v1/w/{wId}/apps/{aId}/runs/{runId}:
 *   get:
 *     summary: Get an app run
 *     description: Retrieve a run for an app in the workspace identified by {wId}.
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
 *         description: ID of the app
 *         schema:
 *           type: string
 *       - in: path
 *         name: runId
 *         required: true
 *         description: ID of the run
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The run
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 run:
 *                   $ref: '#/components/schemas/Run'
 */

export type GetRunResponseBody = {
  run: RunType;
};

export default handler;
