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
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { PatchDataSourceViewSchema } from "@app/types/api/public/spaces";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { ConnectorType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isLeft } from "fp-ts/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type PatchDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
};

export type GetDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
  connector: ConnectorType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewResponseBody>>,
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  if (!dataSourceView.canReadOrAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      let connector: ConnectorType | null = null;
      const connectorId = dataSourceView.dataSource.connectorId;

      if (connectorId) {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const connectorRes = await connectorsAPI.getConnector(connectorId);
        if (connectorRes.isOk()) {
          connector = {
            ...connectorRes.value,
            connectionId: null,
          };
        }
      }

      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
        connector,
      });
    }

    case "PATCH": {
      const isSaveDataSourceViewsEnabled =
        await KillSwitchResource.isKillSwitchEnabled(
          "save_data_source_views"
        );
      if (isSaveDataSourceViewsEnabled) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message:
              "Saving data source views is temporarily disabled, try again later.",
          },
        });
      }

      const patchBodyValidation = PatchDataSourceViewSchema.decode(req.body);

      if (isLeft(patchBodyValidation)) {
        const pathError = reporter.formatValidationErrors(
          patchBodyValidation.left
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            message: `invalid request body: ${pathError}`,
            type: "invalid_request_error",
          },
        });
      }

      const { right: patchBody } = patchBodyValidation;

      const r = await handlePatchDataSourceView(
        auth,
        patchBody,
        dataSourceView
      );
      if (r.isErr()) {
        switch (r.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message: r.error.message,
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: r.error.message,
              },
            });
          default:
            return assertNever(r.error.code);
        }
      }

      // Re-fetch connector data for the updated DSV
      let connector: ConnectorType | null = null;
      const updatedConnectorId = r.value.dataSource.connectorId;

      if (updatedConnectorId) {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const connectorRes =
          await connectorsAPI.getConnector(updatedConnectorId);
        if (connectorRes.isOk()) {
          connector = {
            ...connectorRes.value,
            connectionId: null,
          };
        }
      }

      return res.status(200).json({
        dataSourceView: r.value.toJSON(),
        connector,
      });
    }

    case "DELETE": {
      if (!dataSourceView.canAdministrate(auth)) {
        // Only admins, or builders who have to the space, can patch.
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users that are `admins` can administrate spaces.",
          },
        });
      }

      const force = req.query.force === "true";
      if (!force) {
        const usageRes = await dataSourceView.getUsagesByAgents(auth);
        if (usageRes.isErr() || usageRes.value.count > 0) {
          return apiError(req, res, {
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

      // Directly, hard delete the data source view.
      await dataSourceView.delete(auth, { hardDelete: true });

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    dataSourceView: { requireCanReadOrAdministrate: true },
  })
);
