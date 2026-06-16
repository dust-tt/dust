import { publicApiApp } from "@front-api/middlewares/ctx";
import agentConfigurations from "./agent_configurations";
import conversations from "./conversations";
import mentions from "./mentions";

// Mounted at /api/v1/w/:wId/assistant.
const app = publicApiApp();

app.route("/agent_configurations", agentConfigurations);
app.route("/conversations", conversations);
app.route("/mentions", mentions);

export default app;
