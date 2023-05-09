import { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { Authenticator, getSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { App, Clone, Dataset } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { AppType } from "@app/types/app";

export type PostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostAppResponseBody | ReturnedAPIErrorType>
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

  const datasets = await getDatasets(auth, app);

  switch (req.method) {
    case "POST":
      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["public", "private", "unlisted"].includes(req.body.visibility) ||
        !(typeof req.body.wId == "string")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { name: string, description: string, visibility, wId }.",
          },
        });
      }

      const targetAuth = await Authenticator.fromSession(
        session,
        req.body.wId as string
      );

      if (!targetAuth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the target workspace can clone an app there.",
          },
        });
      }

      const targetOwner = targetAuth.workspace();
      if (!targetOwner) {
        res.status(401).end();
        return;
      }

      const project = await CoreAPI.cloneProject(app.dustAPIProjectId);
      if (project.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The target workspace was not found.",
          },
        });
      }

      let description = req.body.description ? req.body.description : null;
      let uId = new_id();

      let [cloned] = await Promise.all([
        App.create({
          uId,
          sId: uId.slice(0, 10),
          name: req.body.name,
          description,
          visibility: req.body.visibility,
          dustAPIProjectId: project.value.project.project_id.toString(),
          savedSpecification: app.savedSpecification,
          workspaceId: targetOwner.id,
        }),
      ]);

      await Promise.all(
        datasets.map((d) => {
          return Dataset.create({
            name: d.name,
            description: d.description,
            appId: cloned.id,
            workspaceId: targetOwner.id,
          });
        })
      );

      await Clone.create({
        fromId: app.id,
        toId: cloned.id,
      });

      res.status(201).json({
        app: {
          id: cloned.id,
          uId: cloned.uId,
          sId: cloned.sId,
          name: cloned.name,
          description: cloned.description,
          visibility: cloned.visibility,
          savedSpecification: cloned.savedSpecification,
          savedConfig: cloned.savedConfig,
          savedRun: cloned.savedRun,
          dustAPIProjectId: cloned.dustAPIProjectId,
        },
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
