import type { GetConsumptionFacetsResponse } from "@app/lib/api/analytics/consumption/facets";
import { fetchConsumptionFacets } from "@app/lib/api/analytics/consumption/facets";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionFacetsBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { CONSUMPTION_SCOPE_DIMENSIONS } from "@app/lib/api/analytics/consumption/scope";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { consumptionAnalyticsApp } from "./context";

// Mounted at /api/w/:wId/analytics/consumption/facets.
// Also mounted at /api/w/:wId/me/analytics/consumption/facets.
const app = consumptionAnalyticsApp();

/**
 * @swagger
 * /api/w/{wId}/analytics/consumption/facets:
 *   post:
 *     summary: List consumption analytics facets
 *     description: Lists current entities and historical indexed values present in the selected period for each consumption dimension. The workspace route requires a manager; the /me route is restricted server-side to the authenticated member; the agent route is restricted server-side to workspace managers and editors of the selected agent. A facet is disabled when it has no indexed document in that period after applying every active filter except the facet's own dimension.
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
 *               scope:
 *                 type: string
 *                 enum: [all, automations]
 *                 default: all
 *                 description: Restricts which documents the facets are computed over. `automations` counts only trigger-originated runs.
 *               dimensions:
 *                 type: array
 *                 description: Dimensions to compute facets for. Defaults to every dimension. Omitted dimensions come back as empty arrays. The personal route omits user and group dimensions, and the agent route omits the agent dimension.
 *                 items:
 *                   type: string
 *                   enum: [agent, user, api_key, group, model, tool, skill, source]
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
 *         description: Not authorized for this analytics view
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Failed to retrieve consumption facets
 * /api/w/{wId}/me/analytics/consumption/facets:
 *   $ref: '#/paths/~1api~1w~1{wId}~1analytics~1consumption~1facets'
 * /api/w/{wId}/assistant/agent_configurations/{aId}/analytics/consumption/facets:
 *   $ref: '#/paths/~1api~1w~1{wId}~1analytics~1consumption~1facets'
 */
app.post(
  "/",
  validate("json", ConsumptionFacetsBodySchema),
  async (ctx): HandlerResult<GetConsumptionFacetsResponse> => {
    const auth = ctx.get("auth");
    const userId = ctx.get("consumptionUserId");
    const agentId = ctx.get("consumptionAgentId");
    const { filter, scope, dimensions, ...periodInput } = ctx.req.valid("json");
    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodInput)
    );

    const result = await fetchConsumptionFacets(auth, {
      period,
      filter: {
        ...filter,
        ...(userId ? { users: [userId] } : {}),
        ...(agentId ? { agents: [agentId] } : {}),
      },
      scope,
      dimensions: userId
        ? (dimensions ?? CONSUMPTION_SCOPE_DIMENSIONS).filter(
            (dimension) => dimension !== "user" && dimension !== "group"
          )
        : agentId
          ? (dimensions ?? CONSUMPTION_SCOPE_DIMENSIONS).filter(
              (dimension) => dimension !== "agent"
            )
          : dimensions,
      userId,
      agentId,
    });
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
