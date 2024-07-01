import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";
import { zip } from "fp-ts/lib/Array";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { getConnectorManager } from "@connectors/connectors";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const GetContentNodesParentsRequestBodySchema = t.type({
  internalIds: t.array(t.string),
});

export type GetContentNodesParentsRequestBody = t.TypeOf<
  typeof GetContentNodesParentsRequestBodySchema
>;

type GetContentNodesResponseBody = WithConnectorsAPIErrorReponse<{
  nodes: {
    internalId: string;
    parents: string[] | null;
  }[];
}>;

const _getContentNodesParents = async (
  req: Request<
    { connector_id: string },
    GetContentNodesResponseBody,
    GetContentNodesParentsRequestBody
  >,
  res: Response<GetContentNodesResponseBody>
) => {
  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
    });
  }

  const bodyValidation = GetContentNodesParentsRequestBodySchema.decode(
    req.body
  );
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { internalIds } = bodyValidation.right;

  const connectorManager = getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  });
  const parentsResults = await concurrentExecutor(
    internalIds,
    (internalId) => connectorManager.retrieveContentNodeParents({ internalId }),
    { concurrency: 4 }
  );
  const nodes: { internalId: string; parents: string[] }[] = [];

  for (const [internalId, parentsResult] of zip(internalIds, parentsResults)) {
    if (parentsResult.isErr()) {
      logger.error(parentsResult.error, "Failed to get content node parents");
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: parentsResult.error.message,
        },
      });
    }

    nodes.push({
      internalId,
      parents: parentsResult.value,
    });
  }

  return res.status(200).json({ nodes });
};

export const getContentNodesParentsAPIHandler = withLogging(
  _getContentNodesParents
);
