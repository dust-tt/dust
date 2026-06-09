import { importAgentConfigurationFromYAMLString } from "@app/lib/api/assistant/configuration/yaml_import";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
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

/** @ignoreswagger */
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
