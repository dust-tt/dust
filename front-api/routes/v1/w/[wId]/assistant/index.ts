import { publicApiApp } from "@front-api/middlewares/ctx";
import agentConfigurations from "./agent_configurations";
import conversations from "./conversations";
import genericAgents from "./generic_agents";

// Mounted at /api/v1/w/:wId/assistant.
const app = publicApiApp();

app.route("/agent_configurations", agentConfigurations);
app.route("/conversations", conversations);
app.route("/generic_agents", genericAgents);

export default app;
