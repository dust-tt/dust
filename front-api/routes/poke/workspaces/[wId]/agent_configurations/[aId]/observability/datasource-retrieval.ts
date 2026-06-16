import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchDatasourceRetrievalMetrics } from "@app/lib/api/assistant/observability/datasource_retrieval";
import type { PokeGetDatasourceRetrievalResponse } from "@app/lib/api/poke/agent_configurations";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/agent_configurations/:aId/observability/datasource-retrieval.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeGetDatasourceRetrievalResponse> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");
    const { days } = ctx.req.valid("query");

    const assistant = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!assistant) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent you're trying to access was not found.",
        },
      });
    }

    const datasourceRetrievalResult = await fetchDatasourceRetrievalMetrics(
      auth,
      { agentId: assistant.sId, days }
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
  }
);

export default app;
