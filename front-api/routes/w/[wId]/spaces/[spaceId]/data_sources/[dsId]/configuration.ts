import config from "@app/lib/api/config";
import { isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import type { ConnectorConfiguration } from "@app/types/connectors/configuration";
import {
  ConnectorsAPI,
  UpdateConnectorConfigurationTypeSchema,
} from "@app/types/connectors/connectors_api";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withDataSource } from "@front-api/middleware/with_data_source";
import { withSpace } from "@front-api/middleware/with_space";

export type GetDataSourceConfigurationResponseBody = {
  configuration: ConnectorConfiguration;
};

export type PatchDataSourceConfigurationResponseBody =
  GetDataSourceConfigurationResponseBody;

// Mounted at /api/w/:wId/spaces/:spaceId/data_sources/:dsId/configuration.
// Only Slack and Webcrawler connectors have configurations; Slack is set from
// Poke, so this route is effectively for webcrawler-managed data sources.
const app = workspaceApp();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  withDataSource({ requireCanRead: true }),
  async (ctx): HandlerResult<GetDataSourceConfigurationResponseBody> => {
    const dataSource = ctx.get("dataSource");
    if (!dataSource.connectorId || !isWebsite(dataSource)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_managed",
          message: "Cannot read/update the configuration of this Data Source.",
        },
      });
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "connector_not_found_error",
          message:
            "An error occurred while fetching the connector's configuration",
        },
      });
    }
    return ctx.json({ configuration: connectorRes.value.configuration });
  }
);

app.patch(
  "/",
  withSpace({ requireCanRead: true }),
  withDataSource({ requireCanRead: true }),
  validate("json", UpdateConnectorConfigurationTypeSchema),
  async (ctx): HandlerResult<PatchDataSourceConfigurationResponseBody> => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");

    if (!dataSource.connectorId || !isWebsite(dataSource)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_managed",
          message: "Cannot read/update the configuration of this Data Source.",
        },
      });
    }

    if (!dataSource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that have `write` permission for the current space can update a data source configuration.",
        },
      });
    }

    if (!auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can update a data source configuration.",
        },
      });
    }

    const { configuration } = ctx.req.valid("json");

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const updateRes = await connectorsAPI.updateConfiguration({
      connectorId: dataSource.connectorId.toString(),
      configuration: { configuration },
    });
    if (updateRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "connector_update_error",
          message:
            "An error occurred while updating the connector's configuration",
        },
      });
    }

    return ctx.json({ configuration: updateRes.value.configuration });
  }
);

export default app;
