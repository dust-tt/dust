import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { TRIGGER_KINDS, TRIGGER_STATUSES } from "@app/types/assistant/triggers";
import type { GetTriggersResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { publicApiAuth } from "@front-api/middlewares/public_api_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tId from "./[tId]";
import hooks from "./hooks";
import { serializeTriggersForPublicApi } from "./serialize";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const GetTriggersQuerySchema = z.object({
  kind: z.enum(TRIGGER_KINDS).optional(),
  status: z.enum(TRIGGER_STATUSES).optional(),
  agentConfigurationId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

// No sub-app-wide `publicApiAuth`: /hooks (mounted below) uses its own URL-secret auth instead.
const app = publicApiApp();

app.route("/hooks", hooks);

/**
 * @swagger
 * /api/v1/w/{wId}/triggers:
 *   get:
 *     summary: List triggers
 *     description: |
 *       List the agent triggers (scheduled runs and webhooks) configured across the workspace
 *       identified by {wId}. Requires a workspace admin API key.
 *     tags:
 *       - Triggers
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: kind
 *         required: false
 *         description: Filter by trigger kind
 *         schema:
 *           type: string
 *           enum: [schedule, webhook]
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter by trigger status (defaults to `enabled` only)
 *         schema:
 *           type: string
 *           enum: [enabled, disabled, disabled_by_manager, relocating, downgraded]
 *       - in: query
 *         name: agentConfigurationId
 *         required: false
 *         description: Filter to triggers configured on this agent
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Maximum number of triggers to return (default 50, max 100)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         required: false
 *         description: Number of triggers to skip, for pagination
 *         schema:
 *           type: integer
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The workspace's triggers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 triggers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trigger'
 *       400:
 *         description: Bad Request. Invalid query parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. Requires a workspace admin API key.
 *       404:
 *         description: Workspace not found.
 */
app.get(
  "/",
  publicApiAuth,
  ensureIsAdmin(),
  validate("query", GetTriggersQuerySchema),
  async (ctx): HandlerResult<GetTriggersResponseType> => {
    const auth = ctx.get("auth");
    const { kind, status, agentConfigurationId, limit, offset } =
      ctx.req.valid("query");

    const triggers = await TriggerResource.listByWorkspaceForPublicApi(auth, {
      kind,
      status: status ?? "enabled",
      agentConfigurationId,
      limit: limit ?? DEFAULT_LIMIT,
      offset: offset ?? 0,
    });

    return ctx.json({
      triggers: await serializeTriggersForPublicApi(auth, triggers),
    });
  }
);

app.route("/:tId", tId);

export default app;
