import type {
  ContentNode,
  ContentNodeWithParentIds,
  Result,
  WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import { contentNodeTypeSortOrder, removeNulls } from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { sortBy } from "lodash";

import { getConnectorManager } from "@connectors/connectors";
import { augmentContentNodesWithParentIds } from "@connectors/lib/api/content_nodes";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
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
    const error = contentNodesRes.error;
    
    // Check for specific error types
    if (error instanceof ExternalOAuthTokenError) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "connector_authorization_error",
          message: "Authorization error: " + error.message,
        },
      });
    }

    // Check error message patterns
    const msg = error.message.toLowerCase();
    
    // Network related errors
    if (msg.includes("network") || msg.includes("timeout") || msg.includes("connection")) {
      return apiError(req, res, {
        status_code: 503,
        api_error: {
          type: "unexpected_network_error",
          message: "Network error: " + error.message,
        },
      });
    }

    // Not found errors
    if (msg.includes("not found") || msg.includes("does not exist")) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "connector_not_found",
          message: error.message,
        },
      });
    }

    // Authorization errors
    if (msg.includes("permission") || msg.includes("unauthorized") || 
        msg.includes("forbidden") || msg.includes("access denied")) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "connector_authorization_error",
          message: error.message,
        },
      });
    }

    // Rate limit errors
    if (msg.includes("rate limit") || msg.includes("quota")) {
      return apiError(req, res, {
        status_code: 429,
        api_error: {
          type: "connector_rate_limit_error",
          message: error.message,
        },
      });
    }

    // Invalid request errors
    if (msg.includes("invalid") || msg.includes("malformed")) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    }

    // Unexpected response format
    if (msg.includes("unexpected") || msg.includes("malformed response")) {
      return apiError(req, res, {
        status_code: 502,
        api_error: {
          type: "unexpected_response_format",
          message: error.message,
        },
      });
    }

    // Default to internal server error
    logger.error(error, "Unhandled error in retrieveBatchContentNodes");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: error.message,
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

  const contentNodes = sortBy(
    removeNulls(internalIds.map((internalId) => contentNodesMap[internalId])),
    (c) => [contentNodeTypeSortOrder[c.type], c.title.toLowerCase()]
  );

  if (includeParents) {
    const parentsRes = await augmentContentNodesWithParentIds(
      connector,
      contentNodes
    );
    if (parentsRes.isErr()) {
      const error = parentsRes.error;
      logger.error(error, "Failed to get content node parents");

      // Check for specific error types
      if (error instanceof ExternalOAuthTokenError) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "connector_authorization_error",
            message: "Authorization error: " + error.message,
          },
        });
      }

      // Check error message patterns
      const msg = error.message.toLowerCase();
      
      // Network related errors
      if (msg.includes("network") || msg.includes("timeout") || msg.includes("connection")) {
        return apiError(req, res, {
          status_code: 503,
          api_error: {
            type: "unexpected_network_error",
            message: "Network error: " + error.message,
          },
        });
      }

      // Not found errors
      if (msg.includes("not found") || msg.includes("does not exist")) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "connector_not_found",
            message: error.message,
          },
        });
      }

      // Authorization errors
      if (msg.includes("permission") || msg.includes("unauthorized") || 
          msg.includes("forbidden") || msg.includes("access denied")) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "connector_authorization_error",
            message: error.message,
          },
        });
      }

      // Rate limit errors
      if (msg.includes("rate limit") || msg.includes("quota")) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "connector_rate_limit_error",
            message: error.message,
          },
        });
      }

      // Invalid request errors
      if (msg.includes("invalid") || msg.includes("malformed")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: error.message,
          },
        });
      }

      // Unexpected response format
      if (msg.includes("unexpected") || msg.includes("malformed response")) {
        return apiError(req, res, {
          status_code: 502,
          api_error: {
            type: "unexpected_response_format",
            message: error.message,
          },
        });
      }

      // Default to internal server error
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
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
