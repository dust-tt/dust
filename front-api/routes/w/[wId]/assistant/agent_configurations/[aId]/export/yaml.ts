import { exportAgentConfigurationAsYAML } from "@app/lib/api/assistant/configuration/yaml_export";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

export type GetAgentConfigurationYAMLExportResponseBody = {
  yamlContent: string;
  filename: string;
};

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/export/yaml.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetAgentConfigurationYAMLExportResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const result = await exportAgentConfigurationAsYAML(auth, aId);
    if (result.isErr()) {
      return apiError(ctx, result.error);
    }

    return ctx.json(result.value);
  }
);

export default app;
