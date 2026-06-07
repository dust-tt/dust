import { setInternalWorkspaceSegmentation } from "@app/lib/api/workspace";
import type { LightWorkspaceType } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import { withPokeWorkspace } from "@front-api/middlewares/poke_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import agentConfigurations from "./agent_configurations";
import analytics from "./analytics";
import apps from "./apps";
import assistants from "./assistants";
import authContext from "./auth-context";
import conversations from "./conversations";
import credits from "./credits";
import dataRetention from "./data_retention";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import downgrade from "./downgrade";
import dsync from "./dsync";
import features from "./features";
import files from "./files";
import groups from "./groups";
import invitations from "./invitations";
import llmTraces from "./llm-traces";
import mcp from "./mcp";
import mcpServerViews from "./mcp_server_views";
import memberships from "./memberships";
import observability from "./observability";
import projects from "./projects";
import revoke from "./revoke";
import roles from "./roles";
import skillSuggestions from "./skill_suggestions";
import skills from "./skills";
import spaces from "./spaces";
import switchContract from "./switch_contract";
import triggers from "./triggers";
import upgrade from "./upgrade";
import upgradeEnterprise from "./upgrade_enterprise";
import webhookSources from "./webhook_sources";
import workspaceInfo from "./workspace-info";

export const WorkspaceSegmentationSchema = z.object({
  segmentation: z.literal("interesting").nullable(),
});

export type SegmentWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

// Mounted at /api/poke/workspaces/:wId.
const app = pokeApp();

// `auth-context` runs without `withPokeWorkspace` because it needs to handle
// the missing-workspace case (cross-region redirect). It owns its own
// session-based auth flow internally. Must be mounted before the
// `withPokeWorkspace` middleware below.
app.route("/auth-context", authContext);

// Every route below re-scopes the unscoped Poke `Authenticator` (set by the
// parent /poke `pokeAuth`) to the target workspace.
app.use("*", withPokeWorkspace);

/** @ignoreswagger */
app.patch(
  "/",
  validate("json", WorkspaceSegmentationSchema),
  async (ctx): HandlerResult<SegmentWorkspaceResponseBody> => {
    const auth = ctx.get("auth");
    const { segmentation } = ctx.req.valid("json");

    const workspace = await setInternalWorkspaceSegmentation(
      auth,
      segmentation
    );

    return ctx.json({ workspace });
  }
);

app.route("/agent_configurations", agentConfigurations);
app.route("/analytics", analytics);
app.route("/apps", apps);
app.route("/assistants", assistants);
app.route("/conversations", conversations);
app.route("/credits", credits);
app.route("/data_retention", dataRetention);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/downgrade", downgrade);
app.route("/dsync", dsync);
app.route("/features", features);
app.route("/files", files);
app.route("/groups", groups);
app.route("/invitations", invitations);
app.route("/llm-traces", llmTraces);
app.route("/mcp", mcp);
app.route("/mcp_server_views", mcpServerViews);
app.route("/memberships", memberships);
app.route("/observability", observability);
app.route("/projects", projects);
app.route("/revoke", revoke);
app.route("/roles", roles);
app.route("/skill_suggestions", skillSuggestions);
app.route("/skills", skills);
app.route("/spaces", spaces);
app.route("/switch_contract", switchContract);
app.route("/triggers", triggers);
app.route("/upgrade", upgrade);
app.route("/upgrade_enterprise", upgradeEnterprise);
app.route("/webhook_sources", webhookSources);
app.route("/workspace-info", workspaceInfo);

export default app;
