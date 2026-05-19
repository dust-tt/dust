import { Hono } from "hono";
import { z } from "zod";

import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";

import { validate } from "@front-api/middleware/validator";

const PostManagedDataSourceConfigRequestBodySchema = z.object({
  configValue: z.string(),
});

const ALLOWED_CONFIG_KEYS = new Set<string>([
  "botEnabled",
  "pdfEnabled",
  "codeSyncEnabled",
  "useMetadataForDBML",
  "intercomConversationsNotesSyncEnabled",
  "zendeskSyncUnresolvedTicketsEnabled",
  "zendeskHideCustomerDetails",
  "zendeskRetentionPeriodDays",
  "zendeskTicketTagsToInclude",
  "zendeskTicketTagsToExclude",
  "zendeskOrganizationTagsToInclude",
  "zendeskOrganizationTagsToExclude",
  "zendeskCustomFieldsConfig",
  "zendeskRateLimitTransactionsPerSecond",
  "gongRetentionPeriodDays",
  "gongTrackersEnabled",
  "gongAccountsEnabled",
  "gongPermissionProfileId",
  "gongPermissionProfiles",
  "gongExcludeTitleKeywords",
  "privateIntegrationCredentialId",
  "microsoftSensitivityLabelsToInclude",
]);

// Mounted at /api/w/:wId/data_sources/:dsId/managed/config/:key.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";
  const configKey = c.req.param("key") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      },
      404
    );
  }
  if (!dataSource.connectorId) {
    return c.json(
      {
        error: {
          type: "data_source_error",
          message: "The data source you requested is not managed.",
        },
      },
      404
    );
  }
  if (!ALLOWED_CONFIG_KEYS.has(configKey)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: `Invalid config key: ${configKey}`,
        },
      },
      400
    );
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const configRes = await connectorsAPI.getConnectorConfig(
    dataSource.connectorId,
    configKey
  );

  if (configRes.isErr()) {
    return c.json(
      {
        error: {
          type: "data_source_error",
          message: "Failed to retrieve config for data source.",
          connectors_error: configRes.error,
        },
      },
      404
    );
  }

  return c.json({ configValue: configRes.value.configValue });
});

app.post(
  "/",
  validate("json", PostManagedDataSourceConfigRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const dsId = c.req.param("dsId") ?? "";
    const configKey = c.req.param("key") ?? "";

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return c.json(
        {
          error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        },
        404
      );
    }
    if (!dataSource.connectorId) {
      return c.json(
        {
          error: {
            type: "data_source_error",
            message: "The data source you requested is not managed.",
          },
        },
        404
      );
    }
    if (!ALLOWED_CONFIG_KEYS.has(configKey)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: `Invalid config key: ${configKey}`,
          },
        },
        400
      );
    }

    if (!auth.isAdmin() || !dataSource.canAdministrate(auth)) {
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace " +
              "can edit the configuration of a data source.",
          },
        },
        403
      );
    }

    const { configValue } = c.req.valid("json");

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const setConfigRes = await connectorsAPI.setConnectorConfig(
      dataSource.connectorId,
      configKey,
      configValue
    );

    if (setConfigRes.isErr()) {
      return c.json(
        {
          error: {
            type: "data_source_error",
            message: "Failed to edit the configuration of the data source.",
            connectors_error: setConfigRes.error,
          },
        },
        400
      );
    }

    return c.json({ configValue });
  }
);

export default app;
