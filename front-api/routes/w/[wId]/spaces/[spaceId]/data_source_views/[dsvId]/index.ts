import config from "@app/lib/api/config";
import type {
  GetDataSourceViewResponseBody,
  PatchDataSourceViewResponseBody,
} from "@app/lib/api/data_source_view";
import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import logger from "@app/logger/logger";
import { PatchDataSourceViewSchema } from "@app/types/api/public/spaces";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { ConnectorType } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withDataSourceView } from "@front-api/middlewares/with_data_source_view";
import { withSpace } from "@front-api/middlewares/with_space";

import contentNodes from "./content-nodes";
import documents from "./documents";
import tables from "./tables";

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/spaces/{spaceId}/data_source_views/{dsvId}:
 *   get:
 *     summary: Get a data source view
 *     description: Returns the details of a specific data source view.
 *     tags:
 *       - Private Spaces
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsvId
 *         required: true
 *         description: ID of the data source view
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/PrivateDataSourceView'
 *                 connector:
 *                   type: object
 *                   nullable: true
 *                   description: Connector details if the data source is managed
 *       401:
 *         description: Unauthorized
 *   patch:
 *     summary: Update a data source view
 *     description: Updates a specific data source view.
 *     tags:
 *       - Private Spaces
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsvId
 *         required: true
 *         description: ID of the data source view
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentsIn:
 *                 type: array
 *                 nullable: true
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/PrivateDataSourceView'
 *                 connector:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Delete a data source view
 *     description: Deletes a specific data source view.
 *     tags:
 *       - Private Spaces
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsvId
 *         required: true
 *         description: ID of the data source view
 *         schema:
 *           type: string
 *       - in: query
 *         name: force
 *         required: false
 *         description: Force deletion even if the view is in use
 *         schema:
 *           type: string
 *           enum: ["true"]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       204:
 *         description: Successfully deleted data source view
 *       401:
 *         description: Unauthorized
 */

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetDataSourceViewResponseBody> => {
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
  async (ctx): HandlerResult<PatchDataSourceViewResponseBody> => {
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
