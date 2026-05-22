import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchDatasourceRetrievalDocumentsMetrics } from "@app/lib/api/assistant/observability/datasource_retrieval_documents";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
  // For servers with DB configurations, pass comma-separated config sIds.
  mcpServerConfigIds: z
    .string()
    .transform((val) => (val ? val.split(",") : []))
    .default(""),
  // For servers without DB configurations (like data_sources_file_system), pass server name.
  mcpServerName: z.string().optional(),
  dataSourceId: z.string().min(1),
  limit: z.coerce.number().positive().max(200).default(50),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/datasource-retrieval-documents.
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

  const {
    days,
    version,
    mcpServerConfigIds,
    mcpServerName,
    dataSourceId,
    limit,
  } = ctx.req.valid("query");

  const documentsResult = await fetchDatasourceRetrievalDocumentsMetrics(auth, {
    agentId: assistant.sId,
    days,
    version,
    mcpServerConfigIds,
    mcpServerName,
    dataSourceId,
    limit,
  });
  if (documentsResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve datasource retrieval documents metrics: ${fromError(documentsResult.error).toString()}`,
      },
    });
  }

  return ctx.json(documentsResult.value);
});

export default app;
