import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { GetTriggerResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { publicApiAuth } from "@front-api/middlewares/public_api_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { serializeTriggersForPublicApi } from "../serialize";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Auth applied per-handler, not at the parent, so sibling `/hooks` doesn't inherit it.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/triggers/{tId}:
 *   get:
 *     summary: Get a trigger
 *     description: |
 *       Get one agent trigger (scheduled run or webhook) by id. Requires a workspace admin API
 *       key.
 *     tags:
 *       - Triggers
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: tId
 *         required: true
 *         description: ID of the trigger
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The trigger
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trigger:
 *                   $ref: '#/components/schemas/Trigger'
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. Requires a workspace admin API key.
 *       404:
 *         description: Workspace or trigger not found.
 */
app.get(
  "/",
  publicApiAuth,
  ensureIsAdmin(),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetTriggerResponseType> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");

    const trigger = await TriggerResource.fetchById(auth, tId);
    if (!trigger) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "trigger_not_found",
          message: `Trigger ${tId} not found.`,
        },
      });
    }

    const [serialized] = await serializeTriggersForPublicApi(auth, [trigger]);

    return ctx.json({ trigger: serialized });
  }
);

export default app;
