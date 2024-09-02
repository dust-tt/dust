import type {
  ContentNode,
  ContentNodeWithParentIds,
  Result,
  WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { getConnectorManager } from "@connectors/connectors";
import { augmentContentNodesWithParentIds } from "@connectors/lib/api/content_nodes";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const GetContentNodesRequestBodySchema = t.type({
  includeParents: t.union([t.boolean, t.undefined]),
  internalIds: t.array(t.string),
  viewType: t.union([t.literal("tables"), t.literal("documents")]),
});
type GetContentNodesRequestBody = t.TypeOf<
  typeof GetContentNodesRequestBodySchema
>;

type GetContentNodesResponseBody = WithConnectorsAPIErrorReponse<{
  nodes: (ContentNode | ContentNodeWithParentIds)[];
}>;

const _getContentNodes = async (
  req: Request<
    { connector_id: string },
    GetContentNodesResponseBody,
    GetContentNodesRequestBody
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

  const bodyValidation = GetContentNodesRequestBodySchema.decode(req.body);
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

  const { includeParents, internalIds, viewType } = bodyValidation.right;

  const contentNodesRes: Result<ContentNode[], Error> =
    await getConnectorManager({
      connectorProvider: connector.type,
      connectorId: connector.id,
    }).retrieveBatchContentNodes({ internalIds, viewType });

  if (contentNodesRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: contentNodesRes.error.message,
      },
    });
  }

  const unsortedContentNodes = contentNodesRes.value;

  // sorting via grouping first to avoid n^2 complexity
  const contentNodesMap = unsortedContentNodes.reduce(
    (acc, node) => {
      acc[node.internalId] = node;
      return acc;
    },
    {} as Record<string, ContentNode>
  );

  const contentNodes = removeNulls(
    internalIds.map((internalId) => contentNodesMap[internalId])
  );

  if (includeParents) {
    const parentsRes = await augmentContentNodesWithParentIds(
      connector,
      contentNodes
    );
    if (parentsRes.isErr()) {
      logger.error(parentsRes.error, "Failed to get content node parents.");

      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: parentsRes.error.message,
        },
      });
    }

    return res.status(200).json({
      nodes: parentsRes.value,
    });
  }

  return res.status(200).json({
    nodes: contentNodes,
  });
};

export const getContentNodesAPIHandler = withLogging(_getContentNodes);
