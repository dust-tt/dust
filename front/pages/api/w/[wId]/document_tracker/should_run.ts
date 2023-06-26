import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { DataSource, TrackedDocument } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

const { RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS = "" } = process.env;

export type GetDocumentTrackerShouldRunResponseBody = {
  should_run: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentTrackerShouldRunResponseBody>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  if (!keyRes.value.isSystem) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      if (
        !req.query ||
        typeof req.query.data_source_name !== "string" ||
        typeof req.query.document_id !== "string"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body, `data_source_name` and `document_id` are required.",
          },
        });
      }

      const whitelistedWorkspaceIds =
        RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS.split(",");

      if (!whitelistedWorkspaceIds.includes(owner.sId.toString())) {
        res.status(200).json({ should_run: false });
        return;
      }

      const workspaceDataSourceIds = (
        await DataSource.findAll({
          where: {
            workspaceId: owner.id,
          },
          attributes: ["id"],
        })
      ).map((ds) => ds.id);

      // only run if the workspace has tracked documents
      // (excluding the doc that was just upserted)
      const hasTrackedDocuments = !!(await TrackedDocument.count({
        where: {
          dataSourceId: {
            [Op.in]: workspaceDataSourceIds,
          },
          documentId: {
            [Op.not]: req.query.document_id,
          },
        },
      }));

      res.status(200).json({ should_run: hasTrackedDocuments });
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

export default withLogging(handler);
