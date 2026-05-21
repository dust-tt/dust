import { setInternalWorkspaceSegmentation } from "@app/lib/api/workspace";
import type { LightWorkspaceType } from "@app/types/user";
import { pokeWorkspaceAuth } from "@front-api/middleware/poke_workspace_auth";
import type { HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

import apps from "./apps";
import assistants from "./assistants";
import authContext from "./auth-context";
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
const app = new Hono();

// `auth-context` runs without `pokeWorkspaceAuth` because it needs to handle
// the missing-workspace case (cross-region redirect). It owns its own
// session-based auth flow internally. Must be mounted before the
// `pokeWorkspaceAuth` middleware below.
app.route("/auth-context", authContext);

// Every route below inherits pokeWorkspaceAuth, which resolves the
// super-user Authenticator for the target workspace and stashes it on the
// context.
app.use("*", pokeWorkspaceAuth);

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

app.route("/apps", apps);
app.route("/assistants", assistants);
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
