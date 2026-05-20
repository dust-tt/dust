import { Hono } from "hono";
import datasourceRetrieval from "./datasource-retrieval";
import datasourceRetrievalDocuments from "./datasource-retrieval-documents";
import errorRate from "./error_rate";
import feedbackDistribution from "./feedback-distribution";
import latency from "./latency";
import overview from "./overview";
import skillExecution from "./skill-execution";
import source from "./source";
import summary from "./summary";
import toolExecution from "./tool-execution";
import toolLatency from "./tool-latency";
import toolStepIndex from "./tool-step-index";
import usageMetrics from "./usage-metrics";
import versionMarkers from "./version-markers";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/observability.
const app = new Hono();

app.route("/datasource-retrieval", datasourceRetrieval);
app.route("/datasource-retrieval-documents", datasourceRetrievalDocuments);
app.route("/error_rate", errorRate);
app.route("/feedback-distribution", feedbackDistribution);
app.route("/latency", latency);
app.route("/overview", overview);
app.route("/skill-execution", skillExecution);
app.route("/source", source);
app.route("/summary", summary);
app.route("/tool-execution", toolExecution);
app.route("/tool-latency", toolLatency);
app.route("/tool-step-index", toolStepIndex);
app.route("/usage-metrics", usageMetrics);
app.route("/version-markers", versionMarkers);

export default app;
