import { Hono } from "hono";

import config from "@app/lib/api/config";
import { isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import {
  ConnectorsAPI,
  UpdateConnectorConfigurationTypeSchema,
} from "@app/types/connectors/connectors_api";

import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

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
      return c.json(
        {
          error: {
            type: "data_source_not_managed",
            message:
              "Cannot read/update the configuration of this Data Source.",
          },
        },
        404
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isErr()) {
      return c.json(
        {
          error: {
            type: "connector_not_found_error",
            message:
              "An error occurred while fetching the connector's configuration",
          },
        },
        500
      );
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
      return c.json(
        {
          error: {
            type: "data_source_not_managed",
            message:
              "Cannot read/update the configuration of this Data Source.",
          },
        },
        404
      );
    }

    if (!dataSource.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message:
              "Only the users that have `write` permission for the current space can update a data source configuration.",
          },
        },
        403
      );
    }

    if (!auth.isBuilder()) {
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can update a data source configuration.",
          },
        },
        403
      );
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
      return c.json(
        {
          error: {
            type: "connector_update_error",
            message:
              "An error occurred while updating the connector's configuration",
          },
        },
        500
      );
    }

    return c.json({ configuration: updateRes.value.configuration });
  }
);

export default app;
