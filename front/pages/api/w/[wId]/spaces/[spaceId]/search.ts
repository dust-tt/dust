import type {
  DataSourceViewContentNode,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { CoreAPI, MIN_SEARCH_QUERY_SIZE } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { getContentNodeFromCoreNode } from "@app/lib/api/content_nodes";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

const SearchRequestBody = t.type({
  datasourceViewIds: t.array(t.string),
  query: t.string,
  // should use ContentNodesViewTypeCodec, but the type system
  // fails to infer the type correctly.
  viewType: t.union([
    t.literal("tables"),
    t.literal("documents"),
    t.literal("all"),
  ]),
  limit: t.number,
});

export type PostSpaceSearchResponseBody = {
  nodes: DataSourceViewContentNode[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostSpaceSearchResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.canReadOrAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = SearchRequestBody.decode(req.body);
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

  const {
    datasourceViewIds: datasourceViewSids,
    query,
    viewType,
    limit,
  } = bodyValidation.right;

  if (datasourceViewSids.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No datasource view filters provided.",
      },
    });
  }

  if (query.length < MIN_SEARCH_QUERY_SIZE) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Query must be at least ${MIN_SEARCH_QUERY_SIZE} characters long.`,
      },
    });
  }

  const datasourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    datasourceViewSids
  );

  if (datasourceViews.some((dsv) => dsv.space.id !== space.id)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "All datasource views must belong to the space.",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const searchRes = await coreAPI.searchNodes({
    query,
    filter: {
      data_source_views: datasourceViews.map((dsv) => ({
        data_source_id: dsv.dataSource.dustAPIDataSourceId,
        view_filter: dsv.parentsIn ?? [],
      })),
      // TODO(keyword-search): Include data sources based on the use case.
      // include_data_sources: true,
    },
    options: {
      limit,
    },
  });

  if (searchRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: searchRes.error.message,
      },
    });
  }

  const dataSourceViewById = new Map(
    datasourceViews.map((dsv) => [dsv.dataSource.dustAPIDataSourceId, dsv])
  );

  const nodes = searchRes.value.nodes.flatMap((node) => {
    const dataSourceView = dataSourceViewById.get(node.data_source_id);

    if (!dataSourceView) {
      logger.error(
        {
          nodeId: node.node_id,
          expectedDataSourceId: node.data_source_id,
          availableDataSourceIds: Array.from(dataSourceViewById.keys()),
        },
        "DataSourceView lookup failed for node"
      );
      return [];
    }

    return getContentNodeFromCoreNode(dataSourceView.toJSON(), node, viewType);
  });
  return res.status(200).json({ nodes });
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
