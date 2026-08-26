import { workspaceApp } from "@front-api/middlewares/ctx";
import feedbackDistribution from "./feedback-distribution";
import overview from "./overview";
import versionMarkers from "./version-markers";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/observability.
const app = workspaceApp();

app.route("/feedback-distribution", feedbackDistribution);
app.route("/overview", overview);
app.route("/version-markers", versionMarkers);

export default app;
