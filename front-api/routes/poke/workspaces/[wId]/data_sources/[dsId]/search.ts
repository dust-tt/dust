/* eslint-disable dust/enforce-client-types-in-public-api */
// Disabling because POKE but should probably be refactored to use internal types.

import { handleDataSourceSearch } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import type { DataSourceSearchResponseType } from "@dust-tt/client";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { DataSourceSearchQuerySchema } from "@dust-tt/client";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/search.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DataSourceSearchResponseType> => {
    const auth = ctx.get("auth");
    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    // Allow tags_in / tags_not as either a single string or an array.
    const rawQuery: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(ctx.req.query())) {
      rawQuery[key] = value;
    }
    for (const key of ["tags_in", "tags_not"] as const) {
      const all = ctx.req.queries(key);
      if (all && all.length > 0) {
        rawQuery[key] = all;
      }
    }

    const r = DataSourceSearchQuerySchema.safeParse(rawQuery);
    if (r.error) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: fromError(r.error).toString(),
        },
      });
    }

    const searchQuery = r.data;
    const s = await handleDataSourceSearch({ auth, searchQuery, dataSource });
    if (s.isErr()) {
      switch (s.error.code) {
        case "data_source_error":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "data_source_error",
              message: s.error.message,
            },
          });
        default:
          assertNever(s.error.code);
      }
    }

    return ctx.json(s.value);
  }
);

export default app;
