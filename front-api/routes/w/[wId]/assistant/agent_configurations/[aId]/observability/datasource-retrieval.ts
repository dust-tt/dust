import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchDatasourceRetrievalMetrics } from "@app/lib/api/assistant/observability/datasource_retrieval";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/datasource-retrieval.
const app = workspaceApp();

app.get("/", validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  const { days, version } = ctx.req.valid("query");

  const datasourceRetrievalResult = await fetchDatasourceRetrievalMetrics(
    auth,
    {
      agentId: assistant.sId,
      days,
      version,
    }
  );
  if (datasourceRetrievalResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve datasource retrieval metrics: ${fromError(datasourceRetrievalResult.error).toString()}`,
      },
    });
  }

  const datasources = datasourceRetrievalResult.value;
  const total = datasources.reduce((sum, ds) => sum + ds.count, 0);

  return ctx.json({ datasources, total });
});

export default app;
