import { importAgentConfigurationFromYAMLString } from "@app/lib/api/assistant/configuration/yaml_import";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

export type PostAgentConfigurationFromYAMLResponseBody = {
  agentConfiguration: AgentConfigurationType;
  skippedActions?: { name: string; reason: string }[];
};

const PostAgentConfigurationFromYAMLRequestBodySchema = z.object({
  yamlContent: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/new/yaml.
const app = workspaceApp();

app.post(
  "/",
  validate("json", PostAgentConfigurationFromYAMLRequestBodySchema),
  async (ctx): HandlerResult<PostAgentConfigurationFromYAMLResponseBody> => {
    const auth = ctx.get("auth");
    const { yamlContent } = ctx.req.valid("json");

    const result = await importAgentConfigurationFromYAMLString(
      auth,
      yamlContent
    );

    if (result.isErr()) {
      return apiError(ctx, result.error);
    }

    const { agentConfiguration, skippedActions } = result.value;
    return ctx.json({ agentConfiguration, skippedActions });
  }
);

export default app;
