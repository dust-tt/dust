import { exportAgentConfigurationAsYAML } from "@app/lib/api/assistant/configuration/yaml_export";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/export/yaml.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const result = await exportAgentConfigurationAsYAML(auth, aId);
  if (result.isErr()) {
    return apiError(c, result.error);
  }

  return c.json(result.value);
});

export default app;
