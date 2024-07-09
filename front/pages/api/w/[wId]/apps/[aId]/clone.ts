import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { App, Clone, Dataset } from "@app/lib/models/apps";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type PostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostAppResponseBody>>,
  auth: Authenticator,
  session: SessionWithUser
): Promise<void> {
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

      const coreAPI = new CoreAPI(logger);
      const project = await coreAPI.cloneProject({
        projectId: app.dustAPIProjectId,
      });
      if (project.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The target workspace was not found.",
          },
        });
      }

      const description = req.body.description ? req.body.description : null;

      const [cloned] = await Promise.all([
        App.create({
          sId: generateLegacyModelSId(),
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
            schema: d.schema,
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

export default withSessionAuthenticationForWorkspace(handler);
