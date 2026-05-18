import { Hono } from "hono";
import { z } from "zod";

import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import {
  getCursorPaginationParams,
  SortingParamsCodec,
} from "@app/lib/api/pagination";
import { ContentNodesViewTypeCodec } from "@app/types/connectors/content_nodes";

import { dataSourceViewResource } from "@front-api/middleware/data_source_view_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const ContentNodesBody = z.object({
  internalIds: z.array(z.string().nullable()).optional(),
  parentId: z.string().optional(),
  viewType: ContentNodesViewTypeCodec,
  sorting: SortingParamsCodec.optional(),
});

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/content-nodes.
const app = new Hono();

app.post(
  "/",
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

export default app;
