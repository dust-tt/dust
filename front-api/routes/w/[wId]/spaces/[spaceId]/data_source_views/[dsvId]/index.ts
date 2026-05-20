import config from "@app/lib/api/config";
import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import logger from "@app/logger/logger";
import { PatchDataSourceViewSchema } from "@app/types/api/public/spaces";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { ConnectorType } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { withDataSourceView } from "@front-api/middleware/with_data_source_view";
import { withSpace } from "@front-api/middleware/with_space";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

import contentNodes from "./content-nodes";
import documents from "./documents";
import tables from "./tables";

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId.
const app = new Hono();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const dataSourceView = ctx.get("dataSourceView");
    let connector: ConnectorType | null = null;
    const connectorId = dataSourceView.dataSource.connectorId;

    if (connectorId) {
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const connectorRes = await connectorsAPI.getConnector(connectorId);
      if (connectorRes.isOk()) {
        connector = { ...connectorRes.value, connectionId: null };
      }
    }

    return ctx.json({ dataSourceView: dataSourceView.toJSON(), connector });
  }
);

app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  validate("json", PatchDataSourceViewSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const dataSourceView = ctx.get("dataSourceView");

    const isSaveDataSourceViewsEnabled =
      await KillSwitchResource.isKillSwitchEnabled("save_data_source_views");
    if (isSaveDataSourceViewsEnabled) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "app_auth_error",
          message:
            "Saving data source views is temporarily disabled, try again later.",
        },
      });
    }

    const r = await handlePatchDataSourceView(
      auth,
      ctx.req.valid("json"),
      dataSourceView
    );
    if (r.isErr()) {
      switch (r.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: r.error.message,
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: r.error.message,
            },
          });
        default:
          assertNever(r.error.code);
      }
    }

    let connector: ConnectorType | null = null;
    const updatedConnectorId = r.value.dataSource.connectorId;
    if (updatedConnectorId) {
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const connectorRes = await connectorsAPI.getConnector(updatedConnectorId);
      if (connectorRes.isOk()) {
        connector = { ...connectorRes.value, connectionId: null };
      }
    }

    return ctx.json({ dataSourceView: r.value.toJSON(), connector });
  }
);

app.delete(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const dataSourceView = ctx.get("dataSourceView");

    if (!dataSourceView.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only users that are `admins` can administrate spaces.",
        },
      });
    }

    const force = ctx.req.query("force") === "true";
    if (!force) {
      const usageRes = await dataSourceView.getUsagesByAgents(auth);
      if (usageRes.isErr() || usageRes.value.count > 0) {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "data_source_error",
            message: usageRes.isOk()
              ? `The data source view is in use by ${usageRes.value.agents.map((a) => a.name).join(", ")} and cannot be deleted.`
              : "The data source view is in use and cannot be deleted.",
          },
        });
      }
    }

    await dataSourceView.delete(auth, { hardDelete: true });
    return ctx.body(null, 204);
  }
);

app.route("/content-nodes", contentNodes);
app.route("/documents", documents);
app.route("/tables", tables);

export default app;
