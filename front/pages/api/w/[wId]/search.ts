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
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

const SearchRequestBody = t.type({
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
  auth: Authenticator
): Promise<void> {
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

  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  if (!spaces.length) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No accessible spaces found.",
      },
    });
  }

  const allDatasourceViews = await DataSourceViewResource.listBySpaces(
    auth,
    spaces
  );

  if (!allDatasourceViews.length) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No datasource views found in accessible spaces.",
      },
    });
  }

  const { query, viewType, limit } = bodyValidation.right;

  if (query.length < MIN_SEARCH_QUERY_SIZE) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Query must be at least ${MIN_SEARCH_QUERY_SIZE} characters long.`,
      },
    });
  }

  const dataSourceParentsByDataSourceId = allDatasourceViews.reduce(
    (acc, dsv) => {
      const dataSourceId = dsv.dataSource.dustAPIDataSourceId;
      if (acc.get(dataSourceId) !== null) {
        if (dsv.parentsIn) {
          if (!acc.has(dataSourceId)) {
            acc.set(dataSourceId, []);
          }

          acc.get(dataSourceId)?.push(...dsv.parentsIn);
        } else {
          acc.set(dataSourceId, null);
        }
      }

      return acc;
    },
    new Map<string, string[] | null>()
  );

  const filter = [...dataSourceParentsByDataSourceId.entries()].map(
    ([data_source_id, view_filter]) => ({
      data_source_id,
      view_filter: view_filter ? [...new Set(view_filter)] : [],
    })
  );

  if (filter.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `User does not have access to any datasource.`,
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const searchRes = await coreAPI.searchNodes({
    query,
    filter: {
      data_source_views: filter,
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

  // Can have multiple datasource views with the same data source id - randomly keeps one
  const dataSourceViewById = new Map(
    allDatasourceViews.map((dsv) => [dsv.dataSource.dustAPIDataSourceId, dsv])
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

export default withSessionAuthenticationForWorkspace(handler);
