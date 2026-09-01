import { workspaceApp } from "@front-api/middlewares/ctx";

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/frames/{frameId}/functions/{name}/invocations:
 *   post:
 *     summary: Invoke an active Frames v2 function
 *     description: Resolves a bare function name from the Frame's active immutable publication, checks Frame use rights, and starts an invocation pinned to that publication.
 *     tags:
 *       - Private Frames
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: frameId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         description: Bare function name declared by the active Frame publication.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrivateFrameFunctionInvocationRequest'
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Invocation created. Fast invocations may also include their terminal outcome.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PrivateFrameFunctionInvocationResponse'
 *       401:
 *         description: The function requires a workspace member or a stricter caller identity.
 *       404:
 *         description: Frame, active publication, function, or Frame use right not found.
 *       500:
 *         description: Invocation failed before it could be created.
 */

export default app;
