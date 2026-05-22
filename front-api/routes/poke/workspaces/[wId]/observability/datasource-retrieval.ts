import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  fetchWorkspaceDatasourceRetrievalMetrics,
  type WorkspaceDatasourceRetrievalData,
} from "@app/lib/api/assistant/observability/datasource_retrieval";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type PokeGetWorkspaceDatasourceRetrievalResponse = {
  datasources: WorkspaceDatasourceRetrievalData[];
  total: number;
};

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/poke/workspaces/:wId/observability/datasource-retrieval.
const app = pokeApp();

app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeGetWorkspaceDatasourceRetrievalResponse> => {
    const auth = ctx.get("auth");
    const { days } = ctx.req.valid("query");

    const datasourceRetrievalResult =
      await fetchWorkspaceDatasourceRetrievalMetrics(auth, { days });

    if (datasourceRetrievalResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve workspace datasource retrieval metrics: ${fromError(datasourceRetrievalResult.error).toString()}`,
        },
      });
    }

    const datasources = datasourceRetrievalResult.value;
    const total = datasources.reduce((sum, ds) => sum + ds.count, 0);

    return ctx.json({ datasources, total });
  }
);

export default app;
