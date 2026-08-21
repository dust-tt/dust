import type { GetConsumptionFacetsResponse } from "@app/lib/api/analytics/consumption/facets";
import { fetchConsumptionFacets } from "@app/lib/api/analytics/consumption/facets";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/analytics/consumption/facets.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/analytics/consumption/facets:
 *   post:
 *     summary: List consumption analytics facets
 *     description: Lists current workspace entities and historical indexed values present in the selected period for each consumption dimension. A facet is disabled when it has no indexed document in that period after applying every active filter except the facet's own dimension.
 *     tags:
 *       - Private Analytics
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               period:
 *                 type: string
 *                 enum: [cycle, days]
 *                 default: cycle
 *               days:
 *                 type: integer
 *                 minimum: 1
 *                 default: 30
 *               filter:
 *                 type: object
 *                 description: Map of consumption dimensions to selected values.
 *                 additionalProperties: false
 *                 properties:
 *                   agents:
 *                     type: array
 *                     items:
 *                       type: string
 *                   users:
 *                     type: array
 *                     items:
 *                       type: string
 *                   api_keys:
 *                     type: array
 *                     items:
 *                       type: string
 *                   groups:
 *                     type: array
 *                     items:
 *                       type: string
 *                   models:
 *                     type: array
 *                     items:
 *                       type: string
 *                   tools:
 *                     type: array
 *                     items:
 *                       type: string
 *                   skills:
 *                     type: array
 *                     items:
 *                       type: string
 *                   sources:
 *                     type: array
 *                     items:
 *                       type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Consumption facets and their contextual availability
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [period, facets]
 *               properties:
 *                 period:
 *                   type: object
 *                   required: [startDate, endDate]
 *                   properties:
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                 facets:
 *                   type: object
 *                   required: [agent, user, api_key, group, model, tool, skill, source]
 *                   properties:
 *                     agent:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *                     user:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *                     api_key:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *                     group:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *                     model:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *                     tool:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *                     skill:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *                     source:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PrivateConsumptionFacet'
 *       403:
 *         description: Manager role required
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Failed to retrieve consumption facets
 */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionBodySchema),
  async (ctx): HandlerResult<GetConsumptionFacetsResponse> => {
    const auth = ctx.get("auth");
    const { filter, ...periodInput } = ctx.req.valid("json");
    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodInput)
    );

    const result = await fetchConsumptionFacets(auth, { period, filter });
    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve consumption facets.",
          },
        },
        { error: result.error }
      );
    }

    return ctx.json(result.value);
  }
);

export default app;
