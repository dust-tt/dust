import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  ensureIsManager,
  ensureIsUser,
} from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { consumptionAnalyticsApp } from "./context";
import exportRawRoute from "./export-raw";
import facets from "./facets";
import overview from "./overview";
import timeseries from "./timeseries";
import topAgents from "./top-agents";
import topApiKeys from "./top-api-keys";
import topGroups from "./top-groups";
import topModels from "./top-models";
import topSkills from "./top-skills";
import topSources from "./top-sources";
import topTools from "./top-tools";
import topUsers from "./top-users";

const AgentParamsSchema = z.object({
  aId: z.string(),
});

const SkillParamsSchema = z.object({
  sId: z.string(),
});

function mountSharedConsumptionRoutes(
  app: ReturnType<typeof consumptionAnalyticsApp>,
  { includeTopSkills = true }: { includeTopSkills?: boolean } = {}
) {
  app.route("/facets", facets);
  app.route("/overview", overview);
  app.route("/timeseries", timeseries);
  app.route("/top-api-keys", topApiKeys);
  app.route("/top-models", topModels);
  if (includeTopSkills) {
    app.route("/top-skills", topSkills);
  }
  app.route("/top-sources", topSources);
  app.route("/top-tools", topTools);
}

export function createWorkspaceConsumptionRoutes() {
  const app = consumptionAnalyticsApp();
  app.use(ensureIsManager());

  mountSharedConsumptionRoutes(app);
  app.route("/export-raw", exportRawRoute);
  app.route("/top-agents", topAgents);
  app.route("/top-groups", topGroups);
  app.route("/top-users", topUsers);

  return app;
}

export function createPersonalConsumptionRoutes() {
  const app = consumptionAnalyticsApp();
  app.use(ensureIsUser());
  app.use(async (ctx, next) => {
    const user = ctx.get("auth").getNonNullableUser();
    ctx.set("consumptionExcludedDimensions", ["user", "group"]);
    ctx.set("consumptionRequiredFilter", { users: [user.sId] });
    await next();
  });

  mountSharedConsumptionRoutes(app);
  // A single-user view does not need member or group ranking endpoints.
  app.route("/top-agents", topAgents);

  return app;
}

export function createAgentConsumptionRoutes() {
  const app = consumptionAnalyticsApp();
  app.use(ensureIsUser());
  app.use("*", validate("param", AgentParamsSchema));
  app.use(async (ctx, next) => {
    const auth = ctx.get("auth");
    const aId = ctx.req.param("aId");
    if (!aId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing agent ID.",
        },
      });
    }
    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });

    if (!agent || (!agent.canRead && !auth.isAdmin())) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent you're trying to access was not found.",
        },
      });
    }

    if (
      !agent.canEdit &&
      !(await auth.hasWorkspacePermission("publish", "agent"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only agent editors can access its consumption analytics.",
        },
      });
    }

    ctx.set("consumptionExcludedDimensions", ["agent"]);
    ctx.set("consumptionRequiredFilter", { agents: [agent.sId] });
    await next();
  });

  mountSharedConsumptionRoutes(app);
  // The current agent is fixed by the route, so only other dimensions rank.
  app.route("/top-groups", topGroups);
  app.route("/top-users", topUsers);

  return app;
}

export function createSkillConsumptionRoutes() {
  const app = consumptionAnalyticsApp();
  app.use(ensureIsUser());
  app.use("*", validate("param", SkillParamsSchema));
  app.use(async (ctx, next) => {
    const auth = ctx.get("auth");
    const sId = ctx.req.param("sId");
    if (!sId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing skill ID.",
        },
      });
    }

    const skill = await SkillResource.fetchById(auth, sId);
    if (!skill) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: "The skill you're trying to access was not found.",
        },
      });
    }

    if (
      !skill.canAdministrate(auth) &&
      !(await auth.hasWorkspacePermission("publish", "skill"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only skill editors can access its consumption analytics.",
        },
      });
    }

    ctx.set("consumptionExcludedDimensions", ["skill"]);
    ctx.set("consumptionRequiredFilter", { skills: [skill.sId] });
    await next();
  });

  mountSharedConsumptionRoutes(app, { includeTopSkills: false });
  // The current skill is fixed by the route, so only other dimensions rank.
  app.route("/top-agents", topAgents);
  app.route("/top-groups", topGroups);
  app.route("/top-users", topUsers);

  return app;
}
