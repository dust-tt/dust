import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SearchDataSourceViewsResponseType } from "@dust-tt/client";
import { SearchDataSourceViewsRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
const app = publicApiApp();

app.get(
  "/",
  ensureIsSystemKey(),
  validate("query", SearchDataSourceViewsRequestSchema),
  async (ctx): HandlerResult<SearchDataSourceViewsResponseType> => {
    const auth = ctx.get("auth");
    const { vaultId, dataSourceId, kind, vaultKind } = ctx.req.valid("query");

    const data_source_views = await DataSourceViewResource.search(auth, {
      dataSourceId,
      kind,
      vaultId,
      vaultKind,
    });

    return ctx.json({
      data_source_views: data_source_views.map((dsv) => dsv.toJSON()),
    });
  }
);

export default app;
