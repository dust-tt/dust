import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { ContentNodesViewTypeCodec } from "@app/types/connectors/content_nodes";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { removeNulls } from "@app/types/shared/utils/general";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ContentNodesBodySchema = z
  .object({
    internalIds: z.array(z.string().nullable()).optional(),
    parentId: z.string().optional(),
    viewType: ContentNodesViewTypeCodec,
    sorting: z
      .array(
        z.object({
          field: z.string(),
          direction: z.enum(["asc", "desc"]),
        })
      )
      .optional(),
  })
  .refine((data) => !(data.parentId && data.internalIds), {
    message: "Cannot fetch with parentId and internalIds at the same time.",
  });

const ParamsSchema = z.object({
  dsvId: z.string(),
  spaceId: z.string(),
});

export type PokeGetDataSourceViewContentNodes = {
  nodes: DataSourceViewContentNode[];
  total: number;
  totalIsAccurate: boolean;
  nextPageCursor: string | null;
};

// Mounted at /api/poke/workspaces/:wId/spaces/:spaceId/data_source_views/:dsvId/content-nodes.
const app = pokeApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", ContentNodesBodySchema),
  async (ctx): HandlerResult<PokeGetDataSourceViewContentNodes> => {
    const auth = ctx.get("auth");
    const { dsvId, spaceId } = ctx.req.valid("param");

    const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId);
    if (
      !dataSourceView ||
      spaceId !== dataSourceView.space.sId ||
      !dataSourceView.canReadOrAdministrate(auth)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_view_not_found",
          message: "The data source view you requested was not found.",
        },
      });
    }

    const { internalIds, parentId, viewType, sorting } = ctx.req.valid("json");

    const paginationRes = getCursorPaginationParams(ctx.req.query());
    if (paginationRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_pagination_parameters",
          message: "Invalid pagination parameters",
        },
      });
    }

    const contentNodesRes = await getContentNodesForDataSourceView(
      dataSourceView,
      {
        internalIds: internalIds ? removeNulls(internalIds) : undefined,
        parentId,
        pagination: paginationRes.value,
        viewType,
        sorting,
      }
    );

    if (contentNodesRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: contentNodesRes.error.message,
        },
      });
    }

    return ctx.json(contentNodesRes.value);
  }
);

export default app;
