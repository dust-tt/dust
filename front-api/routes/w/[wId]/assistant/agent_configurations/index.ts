import { getAgentsUsage } from "@app/lib/api/assistant/agent_usage";
import type {
  GetAgentConfigurationsResponseBody,
  PostAgentConfigurationResponseBody,
} from "@app/lib/api/assistant/configuration";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { runOnRedis } from "@app/lib/api/redis";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import {
  GetAgentConfigurationsQuerySchema,
  PostOrPatchAgentConfigurationRequestBodySchema,
} from "@app/types/api/internal/agent_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import keyBy from "lodash/keyBy";
import omit from "lodash/omit";

import agent from "./[aId]";
import batchUpdateScope from "./batch_update_scope";
import batchUpdateTags from "./batch_update_tags";
import createPending from "./create-pending";
import deleteRoute from "./delete";
import lookup from "./lookup";
import nameAvailable from "./name_available";
import newRoutes from "./new";
import textAsCronRule from "./text_as_cron_rule";
import webhookFilterGenerator from "./webhook_filter_generator";

// Mounted at /api/w/:wId/assistant/agent_configurations. workspaceAuth is
// applied by the parent workspace sub-app.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/agent_configurations:
 *   get:
 *     summary: List agent configurations
 *     description: Returns all agent configurations in the workspace.
 *     tags:
 *       - Private Agents
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: view
 *         required: false
 *         description: Filter agents by view
 *         schema:
 *           type: string
 *           enum: [all, list, favorites, published, admin_internal, global, workspace]
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Maximum number of results to return
 *         schema:
 *           type: integer
 *       - in: query
 *         name: withUsage
 *         required: false
 *         description: Include usage statistics
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: withAuthors
 *         required: false
 *         description: Include recent authors
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: withFeedbacks
 *         required: false
 *         description: Include feedback counts
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: withEditors
 *         required: false
 *         description: Include editors list
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: sort
 *         required: false
 *         description: Sort order
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfigurations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateLightAgentConfiguration'
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create an agent configuration
 *     description: Creates a new agent configuration in the workspace.
 *     tags:
 *       - Private Agents
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assistant
 *             properties:
 *               assistant:
 *                 type: object
 *                 description: Agent configuration to create
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfiguration:
 *                   $ref: '#/components/schemas/PrivateLightAgentConfiguration'
 *       401:
 *         description: Unauthorized
 */

app.get("/", async (ctx): HandlerResult<GetAgentConfigurationsResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const rawQuery = ctx.req.query();

  // Mirror the Next handler: limit is a numeric param but URL params are
  // strings, so coerce before passing to the schema.
  const queryValidation = GetAgentConfigurationsQuerySchema.safeParse({
    ...rawQuery,
    limit:
      typeof rawQuery.limit === "string"
        ? parseInt(rawQuery.limit, 10)
        : undefined,
  });
  if (!queryValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${queryValidation.error.message}`,
      },
    });
  }

  const {
    view,
    limit,
    withUsage,
    withAuthors,
    withFeedbacks,
    withEditors,
    sort,
  } = queryValidation.data;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  let viewParam = view ? view : "all";
  // @ts-expect-error: added for backwards compatibility
  viewParam = viewParam === "assistant-search" ? "list" : viewParam;
  if (viewParam === "admin_internal" && !auth.isDustSuperUser()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message: "Only Dust Super Users can see admin_internal agents.",
      },
    });
  }
  let agentConfigurations = await getAgentConfigurationsForView({
    auth,
    agentsGetView:
      viewParam === "workspace"
        ? "published" // workspace is deprecated, return all visible agents
        : viewParam,
    variant: "light",
    limit,
    sort,
    // Stripped to stay under Next.js' 4MB API response limit.
    omitInstructions: true,
  });
  if (withUsage === "true") {
    const mentionCounts = await runOnRedis(
      { origin: "agent_usage" },
      async (redis) => {
        return getAgentsUsage({
          providedRedis: redis,
          workspaceId: owner.sId,
          limit:
            typeof rawQuery.limit === "string"
              ? parseInt(rawQuery.limit, 10)
              : -1,
        });
      }
    );
    const usageMap = keyBy(mentionCounts, "agentId");
    agentConfigurations = agentConfigurations.map((agentConfiguration) =>
      usageMap[agentConfiguration.sId]
        ? {
            ...agentConfiguration,
            usage: omit(usageMap[agentConfiguration.sId], ["agentId"]),
          }
        : agentConfiguration
    );
  }
  if (withAuthors === "true") {
    const recentAuthors = await getAgentsRecentAuthors({
      auth,
      agents: agentConfigurations,
    });
    agentConfigurations = agentConfigurations.map(
      (agentConfiguration, index) => ({
        ...agentConfiguration,
        lastAuthors: recentAuthors[index],
      })
    );
  }

  if (withEditors === "true") {
    const editors = await getAgentsEditors(auth, agentConfigurations);
    agentConfigurations = agentConfigurations.map((agentConfiguration) => ({
      ...agentConfiguration,
      editors: editors[agentConfiguration.sId],
    }));
  }

  if (withFeedbacks === "true") {
    const feedbacks =
      await AgentMessageFeedbackResource.getFeedbackCountForAssistants(
        auth,
        agentConfigurations
          .filter((agent) => agent.scope !== "global")
          .map((agent) => agent.sId),
        30
      );
    agentConfigurations = agentConfigurations.map((agentConfiguration) => ({
      ...agentConfiguration,
      feedbacks: {
        up:
          feedbacks.find(
            (f) =>
              f.agentConfigurationId === agentConfiguration.sId &&
              f.thumbDirection === "up"
          )?.count ?? 0,
        down:
          feedbacks.find(
            (f) =>
              f.agentConfigurationId === agentConfiguration.sId &&
              f.thumbDirection === "down"
          )?.count ?? 0,
      },
    }));
  }

  return ctx.json({ agentConfigurations });
});

app.post(
  "/",
  validate("json", PostOrPatchAgentConfigurationRequestBodySchema),
  async (ctx): HandlerResult<PostAgentConfigurationResponseBody> => {
    const auth = ctx.get("auth");

    const isSaveAgentConfigurationsEnabled =
      await KillSwitchResource.isKillSwitchEnabled("save_agent_configurations");
    if (isSaveAgentConfigurationsEnabled) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "app_auth_error",
          message:
            "Saving agent configurations is temporarily disabled, try again later.",
        },
      });
    }

    const { assistant } = ctx.req.valid("json");

    const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
      auth,
      assistant,
    });

    if (agentConfigurationRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "assistant_saving_error",
          message: `Error saving agent: ${agentConfigurationRes.error.message}`,
        },
      });
    }

    return ctx.json({ agentConfiguration: agentConfigurationRes.value });
  }
);

// Register static paths BEFORE `/:aId` so the param route does not swallow
// these names as agent ids.
app.route("/batch_update_scope", batchUpdateScope);
app.route("/batch_update_tags", batchUpdateTags);
app.route("/create-pending", createPending);
app.route("/delete", deleteRoute);
app.route("/lookup", lookup);
app.route("/name_available", nameAvailable);
app.route("/new", newRoutes);
app.route("/text_as_cron_rule", textAsCronRule);
app.route("/webhook_filter_generator", webhookFilterGenerator);
app.route("/:aId", agent);

export default app;
