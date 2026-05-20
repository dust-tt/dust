import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import { registerSlackWebhookRouterEntry } from "@app/lib/api/data_sources";
import { deleteNovuSlackChannelSetup } from "@app/lib/notifications";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import logger from "@app/logger/logger";
import {
  ConnectorsAPI,
  UpdateConnectorRequestBodySchema,
} from "@app/types/connectors/connectors_api";
import { isAPIError } from "@app/types/error";
import { sendUserOperationMessage } from "@app/types/shared/user_operation";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { isConnectorsAPIError } from "@dust-tt/client";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted at /api/w/:wId/data_sources/:dsId/managed/update.
const app = new Hono();

app.post("/", validate("json", UpdateConnectorRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
  const dsId = ctx.req.param("dsId") ?? "";

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
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (!dataSource.canAdministrate(auth) || !auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can edit the permissions of a data source.",
      },
    });
  }

  const body = ctx.req.valid("json");

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const updateRes = await connectorsAPI.updateConnector({
    connectorId: dataSource.connectorId.toString(),
    connectionId: body.connectionId,
  });
  const email = user.email;
  if (email && !isDisposableEmailDomain(email)) {
    void sendUserOperationMessage({
      logger,
      message:
        `${email} updated the data source \`${dataSource.name}\` ` +
        `for workspace \`${owner.name}\` sId: \`${owner.sId}\` ` +
        `connectorId: \`${dataSource.connectorId}\``,
    });
  }

  if (updateRes.isErr()) {
    if (isConnectorsAPIError(updateRes.error) && isAPIError(updateRes.error)) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: updateRes.error.type,
          message: updateRes.error.message,
          connectors_error: updateRes.error,
        },
      });
    }
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Could not update the connector",
        connectors_error: updateRes.error,
      },
    });
  }

  // For Slack connections, update the signing secret in the webhook router.
  if (dataSource.connectorProvider === "slack") {
    const webhookRes = await registerSlackWebhookRouterEntry({
      connectionId: body.connectionId,
      extraConfig: body.extraConfig,
    });

    if (webhookRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: webhookRes.error.message,
        },
      });
    }
  }

  // We need to delete the novu channel connection because the slack token may have
  // changed. The connection will be re-created with the new token when the user
  // receives a notification.
  if (dataSource.connectorProvider === "slack_bot") {
    await deleteNovuSlackChannelSetup(user.sId);
  }

  await dataSource.setEditedBy(auth);
  void ServerSideTracking.trackDataSourceUpdated({
    dataSource: dataSource.toJSON(),
    user,
    workspace: owner,
  });

  void emitAuditLogEvent({
    auth,
    action: "datasource.reauthorized",
    targets: [
      buildAuditLogTarget("workspace", owner),
      buildAuditLogTarget("data_source", dataSource),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      data_source_name: dataSource.name,
      provider: dataSource.connectorProvider ?? "unknown",
      new_connection_id: body.connectionId,
    },
  });

  return ctx.json(updateRes.value);
});

export default app;
