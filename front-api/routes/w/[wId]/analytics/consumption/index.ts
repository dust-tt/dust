import {
  ensureIsManager,
  ensureIsUser,
} from "@front-api/middlewares/ensure_role";
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

export function createWorkspaceConsumptionRoutes() {
  const app = consumptionAnalyticsApp();
  app.use(ensureIsManager());
  app.route("/export-raw", exportRawRoute);
  app.route("/facets", facets);
  app.route("/overview", overview);
  app.route("/timeseries", timeseries);
  app.route("/top-agents", topAgents);
  app.route("/top-api-keys", topApiKeys);
  app.route("/top-models", topModels);
  app.route("/top-skills", topSkills);
  app.route("/top-sources", topSources);
  app.route("/top-groups", topGroups);
  app.route("/top-tools", topTools);
  app.route("/top-users", topUsers);

  return app;
}

export function createPersonalConsumptionRoutes() {
  const app = consumptionAnalyticsApp();
  app.use(ensureIsUser());
  app.use(async (ctx, next) => {
    const user = ctx.get("auth").getNonNullableUser();
    ctx.set("consumptionUserId", user.sId);
    await next();
  });

  // A single-user view does not need member or group ranking endpoints.
  app.route("/facets", facets);
  app.route("/overview", overview);
  app.route("/timeseries", timeseries);
  app.route("/top-agents", topAgents);
  app.route("/top-api-keys", topApiKeys);
  app.route("/top-models", topModels);
  app.route("/top-skills", topSkills);
  app.route("/top-sources", topSources);
  app.route("/top-tools", topTools);

  return app;
}
