import { DataSourceType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { DataSource } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

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
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!req.query.name || typeof req.query.name !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }
  const dataSourceModel = await DataSource.findByPk(dataSource.id);
  if (!dataSourceModel) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({
        dataSource: {
          id: dataSource.id,
          name: dataSource.name,
          description: dataSource.description,
          visibility: dataSource.visibility,
          dustAPIProjectId: dataSource.dustAPIProjectId,
          connectorId: dataSource.connectorId,
          connectorProvider: dataSource.connectorProvider,
          assistantDefaultSelected: dataSource.assistantDefaultSelected,
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
              "Only the users that are `builders` for the current workspace can update a data source.",
          },
        });
      }

      let ds: DataSource;
      if (dataSource.connectorId) {
        // managed data source
        if (
          !req.body ||
          typeof req.body.assistantDefaultSelected !== "boolean" ||
          Object.keys(req.body).length !== 1
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Only the assistantDefaultSelected setting can be updated for managed data sources, which must be boolean.",
            },
          });
        }
        ds = await dataSourceModel.update({
          assistantDefaultSelected: req.body.assistantDefaultSelected,
        });
      } else {
        // non-managed data source
        if (
          !req.body ||
          (typeof req.body.description !== "string" &&
            typeof req.body.visibility !== "string" &&
            typeof req.body.assistantDefaultSelected !== "boolean")
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The request body is missing",
            },
          });
        }

        const toUpdate: {
          description?: string | null;
          visibility?: "public" | "private";
          assistantDefaultSelected?: boolean;
        } = {};

        if (typeof req.body.description === "string") {
          toUpdate.description = req.body.description || null;
        }

        if (typeof req.body.visibility === "string") {
          if (!["public", "private"].includes(req.body.visibility)) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "The visibility field must be either `public` or `private` if provided.",
              },
            });
          }
          toUpdate.visibility = req.body.visibility;
        }

        if (typeof req.body.assistantDefaultSelected === "boolean") {
          toUpdate.assistantDefaultSelected = req.body.assistantDefaultSelected;
        }

        ds = await dataSourceModel.update(toUpdate);
      }

      return res.status(200).json({
        dataSource: {
          id: ds.id,
          name: ds.name,
          description: ds.description,
          visibility: ds.visibility,
          assistantDefaultSelected: ds.assistantDefaultSelected,
          dustAPIProjectId: ds.dustAPIProjectId,
          connectorId: ds.connectorId,
          connectorProvider: ds.connectorProvider,
        },
      });

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can delete a data source.",
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
            message: "Failed to delete the data source.",
            data_source_error: dustDataSource.error,
          },
        });
      }

      await dataSourceModel.destroy();

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
