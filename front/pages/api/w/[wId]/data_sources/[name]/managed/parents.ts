import type { WithAPIErrorResponse } from "@dust-tt/types";
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

const GetContentNodeParentsRequestBodySchema = t.type({
  internalIds: t.array(t.string),
});

export type GetContentNodeParentsResponseBody = {
  nodes: { parents: string[]; internalId: string }[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetContentNodeParentsResponseBody>>,
  auth: Authenticator
): Promise<void> {
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
          "Only the users of the current workspace can retrieve parents of connector resources.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      // We use post because we need a body, but we don't create anything

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

      const bodyValidation = GetContentNodeParentsRequestBodySchema.decode(
        req.body
      );

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

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const connectorsRes = await connectorsAPI.getContentNodesParents({
        internalIds,
        connectorId: dataSource.connectorId,
      });

      if (connectorsRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while fetching the resources' parents.`,
          },
        });
      }

      res.status(200).json({ nodes: connectorsRes.value.nodes });
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

export default withSessionAuthenticationForWorkspace(handler);
