import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostConfigBodySchema = z.object({
  configKey: z.string(),
  configValue: z.string(),
});

const ParamsSchema = z.object({
  dsId: z.string(),
});

export type SetConfigResponseBody = {
  configKey: string;
  configValue: string;
};

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/config.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostConfigBodySchema),
  async (ctx): HandlerResult<SetConfigResponseBody> => {
    const auth = ctx.get("auth");
    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    const { configKey, configValue } = ctx.req.valid("json");

    if (!dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "ConnectorId not set.",
        },
      });
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.setConnectorConfig(
      dataSource.connectorId,
      configKey,
      configValue
    );

    if (connectorRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `An error occurred while setting the connector configuration`,
          connectors_error: connectorRes.error,
        },
      });
    }

    return ctx.json({ configKey, configValue });
  }
);

export default app;
