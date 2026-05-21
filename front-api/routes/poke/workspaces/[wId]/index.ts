import { pokeWorkspaceAuth } from "@front-api/middleware/poke_workspace_auth";
import { Hono } from "hono";

import apps from "./apps";
import assistants from "./assistants";
import dataSourceViews from "./data_source_views";
import files from "./files";
import groups from "./groups";
import llmTraces from "./llm-traces";
import mcp from "./mcp";
import mcpServerViews from "./mcp_server_views";
import observability from "./observability";
import projects from "./projects";
import skillSuggestions from "./skill_suggestions";
import skills from "./skills";
import triggers from "./triggers";
import webhookSources from "./webhook_sources";

// Mounted at /api/poke/workspaces/:wId. Every route below inherits
// pokeWorkspaceAuth, which resolves the super-user Authenticator for the
// target workspace and stashes it on the context.
const app = new Hono();

app.use("*", pokeWorkspaceAuth);

app.route("/apps", apps);
app.route("/assistants", assistants);
app.route("/data_source_views", dataSourceViews);
app.route("/files", files);
app.route("/groups", groups);
app.route("/llm-traces", llmTraces);
app.route("/mcp", mcp);
app.route("/mcp_server_views", mcpServerViews);
app.route("/observability", observability);
app.route("/projects", projects);
app.route("/skill_suggestions", skillSuggestions);
app.route("/skills", skills);
app.route("/triggers", triggers);
app.route("/webhook_sources", webhookSources);

export default app;
