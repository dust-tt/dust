import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

interface GetConnectorRedirectResponse {
  redirectUrl: string;
}

// Mounted at /api/poke/connectors/:connectorId/redirect. pokeAuth is applied
// by the parent poke sub-app.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetConnectorRedirectResponse> => {
  const connectorId = ctx.req.param("connectorId") ?? "";
  if (!connectorId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid connector ID.",
      },
    });
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const cRes = await connectorsAPI.getConnector(connectorId);

  if (cRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "connector_not_found_error",
        message: "Connector not found.",
      },
    });
  }

  const connector = cRes.value;

  return ctx.json({
    redirectUrl: `/poke/${connector.workspaceId}/data_sources/${connector.dataSourceId}`,
  });
});

export default app;
