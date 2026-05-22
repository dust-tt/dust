import { setInternalWorkspaceSegmentation } from "@app/lib/api/workspace";
import type { LightWorkspaceType } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import { withPokeWorkspace } from "@front-api/middlewares/poke_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import analytics from "./analytics";
import apps from "./apps";
import assistants from "./assistants";
import authContext from "./auth-context";
import conversations from "./conversations";
import dataRetention from "./data_retention";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import dsync from "./dsync";
import features from "./features";
import files from "./files";
import groups from "./groups";
import llmTraces from "./llm-traces";
import mcp from "./mcp";
import mcpServerViews from "./mcp_server_views";
import memberships from "./memberships";
import observability from "./observability";
import projects from "./projects";
import skillSuggestions from "./skill_suggestions";
import skills from "./skills";
import spaces from "./spaces";
import triggers from "./triggers";
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

app.route("/analytics", analytics);
app.route("/apps", apps);
app.route("/assistants", assistants);
app.route("/conversations", conversations);
app.route("/data_retention", dataRetention);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/dsync", dsync);
app.route("/features", features);
app.route("/files", files);
app.route("/groups", groups);
app.route("/llm-traces", llmTraces);
app.route("/mcp", mcp);
app.route("/mcp_server_views", mcpServerViews);
app.route("/memberships", memberships);
app.route("/observability", observability);
app.route("/projects", projects);
app.route("/skill_suggestions", skillSuggestions);
app.route("/skills", skills);
app.route("/spaces", spaces);
app.route("/triggers", triggers);
app.route("/webhook_sources", webhookSources);
app.route("/workspace-info", workspaceInfo);

export default app;
