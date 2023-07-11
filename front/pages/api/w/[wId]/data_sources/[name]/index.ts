import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { Authenticator, getSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { DataSource } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";

export type GetOrPostDataSourceResponseBody = {
  dataSource: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetOrPostDataSourceResponseBody | ReturnedAPIErrorType | void
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The Data Source you requested was not found.",
      },
    });
  }

  const dataSource = await DataSource.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
          name: req.query.name,
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
          name: req.query.name,
        },
  });

  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The Data Source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({
        dataSource: {
          name: dataSource.name,
          description: dataSource.description,
          visibility: dataSource.visibility,
          config: dataSource.config,
          dustAPIProjectId: dataSource.dustAPIProjectId,
          connectorId: dataSource.connectorId,
          connectorProvider: dataSource.connectorProvider,
          userUpsertable: dataSource.userUpsertable,
        },
      });
      return;

    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can update a Data Source.",
          },
        });
      }

      if (dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Managed data sources cannot be updated.",
          },
        });
      }

      if (
        !req.body ||
        !(typeof req.body.description == "string") ||
        !(typeof req.body.userUpsertable == "boolean") ||
        !["public", "private"].includes(req.body.visibility)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { description, visibility }.",
          },
        });
      }

      const description = req.body.description ? req.body.description : null;

      const ds = await dataSource.update({
        description,
        visibility: req.body.visibility,
        userUpsertable: req.body.userUpsertable,
      });

      return res.status(200).json({
        dataSource: {
          name: ds.name,
          description: ds.description,
          visibility: ds.visibility,
          config: ds.config,
          dustAPIProjectId: ds.dustAPIProjectId,
          connectorId: ds.connectorId,
          connectorProvider: ds.connectorProvider,
          userUpsertable: ds.userUpsertable,
        },
      });

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can delete a Data Source.",
          },
        });
      }

      if (dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Managed data sources cannot be deleted.",
          },
        });
      }

      const dustDataSource = await CoreAPI.deleteDataSource({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
      });

      if (dustDataSource.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete the Data Source.",
            data_source_error: dustDataSource.error,
          },
        });
      }

      await dataSource.destroy();

      res.status(204).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
