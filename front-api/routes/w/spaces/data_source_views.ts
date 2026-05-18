import { Hono } from "hono";
import { z } from "zod";

import config from "@app/lib/api/config";
import { getContentNodeFromCoreNode } from "@app/lib/api/content_nodes";
import {
  getContentNodesForDataSourceView,
  getFlattenedContentNodesOfViewTypeForDataSourceView,
} from "@app/lib/api/data_source_view";
import {
  getCursorPaginationParams,
  SortingParamsCodec,
} from "@app/lib/api/pagination";
import logger from "@app/logger/logger";
import { ContentNodesViewTypeCodec } from "@app/types/connectors/content_nodes";
import { CoreAPI } from "@app/types/core/core_api";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";

import { dataSourceViewResource } from "../../../middleware/data_source_view_resource";
import { spaceResource } from "../../../middleware/space_resource";
import { validate } from "../../../middleware/validator";

const ContentNodesBody = z.object({
  internalIds: z.array(z.string().nullable()).optional(),
  parentId: z.string().optional(),
  viewType: ContentNodesViewTypeCodec,
  sorting: SortingParamsCodec.optional(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId.
export const dataSourceViewsApp = new Hono();

dataSourceViewsApp.post(
  "/content-nodes",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceViewResource({ requireCanReadOrAdministrate: true }),
  validate("json", ContentNodesBody),
  async (c) => {
    const dataSourceView = c.get("dataSourceView");
    const { internalIds, parentId, viewType, sorting } = c.req.valid("json");

    if (parentId && internalIds) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Cannot fetch with parentId and internalIds at the same time.",
          },
        },
        400
      );
    }

    const paginationRes = getCursorPaginationParams(c.req.query());
    if (paginationRes.isErr()) {
      return c.json(
        {
          error: {
            type: "invalid_pagination_parameters",
            message: "Invalid pagination parameters",
          },
        },
        400
      );
    }

    const contentNodesRes = await getContentNodesForDataSourceView(
      dataSourceView,
      {
        internalIds: internalIds
          ? internalIds.filter((id): id is string => id !== null)
          : undefined,
        parentId,
        pagination: paginationRes.value,
        viewType,
        sorting,
      }
    );
    if (contentNodesRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: contentNodesRes.error.message,
          },
        },
        500
      );
    }
    return c.json(contentNodesRes.value);
  }
);

dataSourceViewsApp.get(
  "/documents/:documentId",
  spaceResource({ requireCanRead: true }),
  dataSourceViewResource({ requireCanRead: true }),
  async (c) => {
    const dataSourceView = c.get("dataSourceView");
    const documentId = c.req.param("documentId") ?? "";
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const doc = await coreAPI.getDataSourceDocument({
      dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
      documentId,
      projectId: dataSourceView.dataSource.dustAPIProjectId,
      viewFilter: dataSourceView.toViewFilter(),
    });
    if (doc.isErr()) {
      return c.json(
        {
          error: {
            type: "data_source_error",
            message:
              "There was an error retrieving the data source view's document.",
            data_source_error: doc.error,
          },
        },
        400
      );
    }
    return c.json({ document: doc.value.document });
  }
);

// Note: register `/tables/search` BEFORE `/tables/:tableId` to avoid the
// param route swallowing "search" as an id. Hono's router scans in
// registration order.
dataSourceViewsApp.get(
  "/tables/search",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceViewResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const dataSourceView = c.get("dataSourceView");
    const query = c.req.query("query");
    if (!query || query.length < MIN_SEARCH_QUERY_SIZE) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: `Query must be at least ${MIN_SEARCH_QUERY_SIZE} characters long.`,
          },
        },
        400
      );
    }

    const paginationRes = getCursorPaginationParams(c.req.query());
    if (paginationRes.isErr()) {
      return c.json(
        {
          error: {
            type: "invalid_pagination_parameters",
            message: "Invalid pagination parameters",
          },
        },
        400
      );
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const searchRes = await coreAPI.searchNodes({
      query,
      filter: {
        data_source_views: [
          {
            data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
            view_filter: dataSourceView.parentsIn ?? [],
          },
        ],
        node_types: ["table"],
      },
      options: {
        limit: paginationRes.value?.limit,
        cursor: paginationRes.value?.cursor ?? undefined,
      },
    });
    if (searchRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: searchRes.error.message,
          },
        },
        500
      );
    }
    const tables = searchRes.value.nodes.map((node) => ({
      ...getContentNodeFromCoreNode(node, "table"),
      dataSourceView: dataSourceView.toJSON(),
    }));
    return c.json({
      tables,
      nextPageCursor: searchRes.value.next_page_cursor,
      warningCode: searchRes.value.warning_code,
    });
  }
);

dataSourceViewsApp.get(
  "/tables",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceViewResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const dataSourceView = c.get("dataSourceView");
    const paginationRes = getCursorPaginationParams(c.req.query());
    if (paginationRes.isErr()) {
      return c.json(
        {
          error: {
            type: "invalid_pagination_parameters",
            message: "Invalid pagination parameters",
          },
        },
        400
      );
    }
    const contentNodes =
      await getFlattenedContentNodesOfViewTypeForDataSourceView(
        dataSourceView,
        {
          viewType: "table",
          pagination: paginationRes.value,
        }
      );
    if (contentNodes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: contentNodes.error.message,
          },
        },
        500
      );
    }
    return c.json({
      tables: contentNodes.value.nodes,
      nextPageCursor: contentNodes.value.nextPageCursor,
    });
  }
);

dataSourceViewsApp.get(
  "/tables/:tableId",
  spaceResource({ requireCanRead: true }),
  dataSourceViewResource({ requireCanRead: true }),
  async (c) => {
    const dataSourceView = c.get("dataSourceView");
    const tableId = c.req.param("tableId") ?? "";
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const tableRes = await coreAPI.getTable({
      projectId: dataSourceView.dataSource.dustAPIProjectId,
      dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
      tableId,
    });
    if (tableRes.isErr()) {
      return c.json(
        {
          error: {
            type: "data_source_error",
            message:
              "There was an error retrieving the data source view's document.",
            data_source_error: tableRes.error,
          },
        },
        400
      );
    }
    return c.json({ table: tableRes.value.table });
  }
);
