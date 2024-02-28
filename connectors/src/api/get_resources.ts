import type {
  ConnectorNode,
  WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { BATCH_RETRIEVE_RESOURCE_BY_TYPE } from "@connectors/connectors";
import type { Result } from "@connectors/lib/result";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const GetResourcesRequestBodySchema = t.type({
  resourceInternalIds: t.array(t.string),
});
type GetResourcesRequestBody = t.TypeOf<typeof GetResourcesRequestBodySchema>;

type GetResourcesResponseBody = WithConnectorsAPIErrorReponse<{
  resources: ConnectorNode[];
}>;

const _getResources = async (
  req: Request<
    { connector_id: string },
    GetResourcesResponseBody,
    GetResourcesRequestBody
  >,
  res: Response<GetResourcesResponseBody>
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

  const bodyValidation = GetResourcesRequestBodySchema.decode(req.body);
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

  const { resourceInternalIds } = bodyValidation.right;

  const connectorNodesRes: Result<ConnectorNode[], Error> =
    await BATCH_RETRIEVE_RESOURCE_BY_TYPE[connector.type](
      connector.id,
      resourceInternalIds
    );

  if (connectorNodesRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: connectorNodesRes.error.message,
      },
    });
  }

  const connectorNodes = connectorNodesRes.value;

  return res.status(200).json({
    resources: connectorNodes,
  });
};

export const getResourcesAPIHandler = withLogging(_getResources);
