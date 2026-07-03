import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { PokeGetConnectorCliCatalogResponseBody } from "@app/types/api/poke/connectors/cli_catalog";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/poke/connectors/cli-catalog.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<PokeGetConnectorCliCatalogResponseBody> => {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const result = await connectorsAPI.getAdminCliCatalog();
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          connectors_error: result.error,
          message: "Error fetching the connectors CLI catalog.",
        },
      });
    }

    return ctx.json({ catalog: result.value });
  }
);

export default app;
