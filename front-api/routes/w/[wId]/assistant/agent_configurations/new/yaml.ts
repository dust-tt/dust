import { importAgentConfigurationFromYAMLString } from "@app/lib/api/assistant/configuration/yaml_import";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostAgentConfigurationFromYAMLRequestBodySchema = z.object({
  yamlContent: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/new/yaml.
const app = new Hono();

app.post(
  "/",
  validate("json", PostAgentConfigurationFromYAMLRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { yamlContent } = c.req.valid("json");

    const result = await importAgentConfigurationFromYAMLString(
      auth,
      yamlContent
    );

    if (result.isErr()) {
      return apiError(c, result.error);
    }

    const { agentConfiguration, skippedActions } = result.value;
    return c.json({ agentConfiguration, skippedActions });
  }
);

export default app;
