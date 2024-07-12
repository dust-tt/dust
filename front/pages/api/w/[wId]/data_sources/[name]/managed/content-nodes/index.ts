import type { ContentNode, WithAPIErrorResponse } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

const GetContentNodesRequestBody = t.type({
  internalIds: t.array(t.string),
});

export type GetContentNodesResponseBody = {
  contentNodes: ContentNode[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetContentNodesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can edit the permissions of a data source.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only users of the current workspace can view the permissions of a data source.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (
        dataSource.connectorProvider !== "notion" &&
        dataSource.connectorProvider !== "google_drive"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "connector_provider_not_supported",
            message: "The data source you requested is not supported.",
          },
        });
      }

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsConfig(),
        logger
      );

      const body = req.body;
      if (!body) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing required parameters. Required: resources",
          },
        });
      }

      const bodyValidation = GetContentNodesRequestBody.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
          status_code: 400,
        });
      }

      const { internalIds } = bodyValidation.right;

      const connectorsRes = await connectorsAPI.getContentNodes({
        connectorId: dataSource.connectorId,
        internalIds,
        viewType: "tables",
      });

      if (connectorsRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              "Failed to get the content nodes for the provided internal IDs.",
            connectors_error: connectorsRes.error,
          },
        });
      }

      res.status(200).json({
        contentNodes: connectorsRes.value.nodes,
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
