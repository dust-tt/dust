import { workspaceApp } from "@front-api/middlewares/ctx";

import agentConfigurations from "./agent_configurations";
import builder from "./builder";
import conversations from "./conversations";
import mentions from "./mentions";
import skills from "./skills";

// Mounted at /api/w/:wId/assistant.
const app = workspaceApp();

app.route("/agent_configurations", agentConfigurations);
app.route("/builder", builder);
app.route("/conversations", conversations);
app.route("/mentions", mentions);
app.route("/skills", skills);

export default app;
