import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

export type GetOrPostManagedDataSourceConfigResponseBody = {
  configValue: string;
};

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
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetOrPostManagedDataSourceConfigResponseBody> => {
    const auth = ctx.get("auth");
    const dsId = ctx.req.param("dsId") ?? "";
    const configKey = ctx.req.param("key") ?? "";

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
    if (!dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_error",
          message: "The data source you requested is not managed.",
        },
      });
    }
    if (!ALLOWED_CONFIG_KEYS.has(configKey)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid config key: ${configKey}`,
        },
      });
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
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_error",
          message: "Failed to retrieve config for data source.",
          connectors_error: configRes.error,
        },
      });
    }

    return ctx.json({ configValue: configRes.value.configValue });
  }
);

app.post(
  "/",
  validate("json", PostManagedDataSourceConfigRequestBodySchema),
  async (ctx): HandlerResult<GetOrPostManagedDataSourceConfigResponseBody> => {
    const auth = ctx.get("auth");
    const dsId = ctx.req.param("dsId") ?? "";
    const configKey = ctx.req.param("key") ?? "";

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
    if (!dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_error",
          message: "The data source you requested is not managed.",
        },
      });
    }
    if (!ALLOWED_CONFIG_KEYS.has(configKey)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid config key: ${configKey}`,
        },
      });
    }

    if (!auth.isAdmin() || !dataSource.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `admins` for the current workspace " +
            "can edit the configuration of a data source.",
        },
      });
    }

    const { configValue } = ctx.req.valid("json");

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
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message: "Failed to edit the configuration of the data source.",
          connectors_error: setConfigRes.error,
        },
      });
    }

    return ctx.json({ configValue });
  }
);

export default app;
