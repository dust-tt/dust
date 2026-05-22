import { exportAgentConfigurationAsYAML } from "@app/lib/api/assistant/configuration/yaml_export";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type GetAgentConfigurationYAMLExportResponseBody = {
  yamlContent: string;
  filename: string;
};

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/export/yaml.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetAgentConfigurationYAMLExportResponseBody> => {
    const auth = ctx.get("auth");
    const aId = ctx.req.param("aId") ?? "";

    const result = await exportAgentConfigurationAsYAML(auth, aId);
    if (result.isErr()) {
      return apiError(ctx, result.error);
    }

    return ctx.json(result.value);
  }
);

export default app;
