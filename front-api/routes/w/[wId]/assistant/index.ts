import { Hono } from "hono";

import agentConfigurations from "./agent_configurations";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";
import builder from "./builder";
import conversations from "./conversations";
import mentions from "./mentions";
import skills from "./skills";

// Mounted at /api/w/:wId/assistant.
const app = new Hono();

app.use("*", workspaceAuth());

app.route("/agent_configurations", agentConfigurations);
app.route("/builder", builder);
app.route("/conversations", conversations);
app.route("/mentions", mentions);
app.route("/skills", skills);

export default app;
