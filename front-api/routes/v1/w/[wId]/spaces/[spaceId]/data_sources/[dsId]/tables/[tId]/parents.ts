import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { PostParentsResponseType } from "@dust-tt/client";
import { PostTableParentsRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  dsId: z.string(),
  tId: z.string(),
  spaceId: z.string().optional(),
});

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
const app = publicApiApp();

app.post(
  "/",
  ensureIsSystemKey(),
  validate("param", ParamsSchema),
  validate("json", PostTableParentsRequestSchema),
  async (ctx): HandlerResult<PostParentsResponseType> => {
    const auth = ctx.get("auth");
    const { dsId, tId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables_table_parents" }
    );

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      spaceIdParam,
      dataSource
    );

    if (!dataSource || dataSource.space.sId !== spaceId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    if (dataSource.space.kind === "conversations") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you're trying to access was not found",
        },
      });
    }

    const { parents, parent_id: parentId } = ctx.req.valid("json");

    // Enforce parents consistency: parents[0] === documentId, parents[1] === parentId (or there is no parents[1] and parentId is null).
    if (parents.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid parents: parents must have at least one element.`,
        },
      });
    }
    if (parents[0] !== tId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid parents: parents[0] should be equal to table_id.`,
        },
      });
    }
    if ((parents.length >= 2 || parentId !== null) && parents[1] !== parentId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid parent id: parents[1] and parent_id should be equal.`,
        },
      });
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const updateRes = await coreAPI.updateTableParents({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId: tId,
      parentId: parentId ?? null,
      parents,
    });

    if (updateRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error updating the `parents` field.",
          data_source_error: updateRes.error,
        },
      });
    }

    return ctx.json({ updated: true });
  }
);

export default app;
