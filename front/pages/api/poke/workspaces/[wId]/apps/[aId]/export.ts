import _ from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { getDatasetHash, getDatasets } from "@app/lib/api/datasets";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AppResource } from "@app/lib/resources/app_resource";
import { apiError } from "@app/logger/withlogging";
import type { AppType, DatasetType, WithAPIErrorResponse } from "@app/types";

export type ExportAppResponseBody = {
  app: Omit<AppType, "space" | "id"> & { datasets: DatasetType[] };
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ExportAppResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const app = await AppResource.fetchById(auth, aId);
  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const dataSetsToFetch = (await getDatasets(auth, app.toJSON())).map(
        (ds) => ({ datasetId: ds.name, hash: "latest" })
      );
      console.log(dataSetsToFetch);
      const datasets = [];
      for (const dataset of dataSetsToFetch) {
        const fromCore = await getDatasetHash(
          auth,
          app,
          dataset.datasetId,
          dataset.hash,
          { includeDeleted: true }
        );
        if (fromCore) {
          datasets.push(fromCore);
        }
      }
      const appJson = _.omit(app.toJSON(), "id", "space");

      res.status(200).json({ app: { ...appJson, datasets } });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthentication(handler);
