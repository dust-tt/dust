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
import {
  apiError,
  type HandlerResult,
  reshapeQueryWithArrayFields,
} from "@front-api/middlewares/utils";
import { fromError } from "zod-validation-error";

const ARRAYABLE_QUERY_KEYS = ["tags_in", "tags_not"] as const;

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/search.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<DataSourceSearchResponseType> => {
  const auth = ctx.get("auth");
  const dsId = ctx.req.param("dsId") ?? "";

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

  const r = DataSourceSearchQuerySchema.safeParse(
    reshapeQueryWithArrayFields(ctx, ARRAYABLE_QUERY_KEYS)
  );
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
});

export default app;
