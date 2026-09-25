import { workspaceApp } from "@front-api/middlewares/ctx";

import agentConfigurations from "./agent_configurations";
import builder from "./builder";
import conversations from "./conversations";
import globalAgents from "./global_agents";
import goTemplate from "./go-template";
import homepageUseCases from "./homepage_use_cases";
import mentions from "./mentions";
import ongoingAgentLoops from "./ongoing-agent-loops";
import skills from "./skills";
import suggestionBatches from "./suggestion_batches";

// Mounted at /api/w/:wId/assistant.
const app = workspaceApp();

app.route("/agent_configurations", agentConfigurations);
app.route("/builder", builder);
app.route("/conversations", conversations);
app.route("/global_agents", globalAgents);
app.route("/go-template", goTemplate);
app.route("/homepage_use_cases", homepageUseCases);
app.route("/mentions", mentions);
app.route("/ongoing-agent-loops", ongoingAgentLoops);
app.route("/skills", skills);
app.route("/suggestion_batches", suggestionBatches);

export default app;
