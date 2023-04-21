import { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { Authenticator, getSession } from "@app/lib/auth";
import { checkDatasetData } from "@app/lib/datasets";
import { DustAPI } from "@app/lib/dust_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Dataset } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DatasetType } from "@app/types/dataset";

export type GetDatasetsResponseBody = {
  datasets: DatasetType[];
};

export type PostDatasetResponseBody = {
  dataset: DatasetType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetDatasetsResponseBody | PostDatasetResponseBody | ReturnedAPIErrorType
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
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  const app = await getApp(auth, req.query.aId as string);
  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const datasets = await getDatasets(auth, app);

      res.status(200).json({
        datasets,
      });
      return;

    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can modify an app.",
          },
        });
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !Array.isArray(req.body.data)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects \
               { name: string, description: string, data: any[] }.",
          },
        });
      }

      // Check that dataset does not already exist.
      let existing = await Dataset.findAll({
        where: {
          workspaceId: owner.id,
          appId: app.id,
        },
        attributes: ["name"],
      });

      let exists = false;
      existing.forEach((e) => {
        if (e.name == req.body.name) {
          exists = true;
        }
      });
      if (exists) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The dataset name already exists in this app.",
          },
        });
      }

      // Check data validity.
      try {
        checkDatasetData(req.body.data);
      } catch (e) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The data passed as request body is invalid.",
          },
        });
      }

      // Reorder all keys as Dust API expects them ordered.
      let data = req.body.data.map((d: any) => {
        return Object.keys(d)
          .sort()
          .reduce((obj: { [key: string]: any }, key) => {
            obj[key] = d[key];
            return obj;
          }, {});
      });

      const dataset = await DustAPI.createDataset(
        app.dustAPIProjectId,
        req.body.name,
        data
      );
      if (dataset.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The dataset creation failed.",
            app_error: dataset.error,
          },
        });
      }

      let description = req.body.description ? req.body.description : null;

      await Dataset.create({
        name: req.body.name,
        description,
        appId: app.id,
        workspaceId: owner.id,
      });

      res.status(201).json({
        dataset: {
          name: req.body.name,
          description,
        },
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
