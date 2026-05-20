import config from "@app/lib/api/config";
import { isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import {
  ConnectorsAPI,
  UpdateConnectorConfigurationTypeSchema,
} from "@app/types/connectors/connectors_api";
import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted at /api/w/:wId/spaces/:spaceId/data_sources/:dsId/configuration.
// Only Slack and Webcrawler connectors have configurations; Slack is set from
// Poke, so this route is effectively for webcrawler-managed data sources.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceResource({ requireCanRead: true }),
  async (c) => {
    const dataSource = c.get("dataSource");
    if (!dataSource.connectorId || !isWebsite(dataSource)) {
      return apiError(c, {
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
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "connector_not_found_error",
          message:
            "An error occurred while fetching the connector's configuration",
        },
      });
    }
    return c.json({ configuration: connectorRes.value.configuration });
  }
);

app.patch(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceResource({ requireCanRead: true }),
  validate("json", UpdateConnectorConfigurationTypeSchema),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");

    if (!dataSource.connectorId || !isWebsite(dataSource)) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "data_source_not_managed",
          message: "Cannot read/update the configuration of this Data Source.",
        },
      });
    }

    if (!dataSource.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that have `write` permission for the current space can update a data source configuration.",
        },
      });
    }

    if (!auth.isBuilder()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can update a data source configuration.",
        },
      });
    }

    const { configuration } = c.req.valid("json");

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const updateRes = await connectorsAPI.updateConfiguration({
      connectorId: dataSource.connectorId.toString(),
      configuration: { configuration },
    });
    if (updateRes.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "connector_update_error",
          message:
            "An error occurred while updating the connector's configuration",
        },
      });
    }

    return c.json({ configuration: updateRes.value.configuration });
  }
);

export default app;
