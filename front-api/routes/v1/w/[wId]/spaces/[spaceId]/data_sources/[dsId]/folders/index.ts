import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { GetFoldersResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import fId from "./[fId]";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
const app = publicApiApp();

app.route("/:fId", fId);

const ParamsSchema = z.object({
  dsId: z.string(),
});

const QuerySchema = z.object({
  limit: z.coerce.number().int().nonnegative().optional().default(10),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetFoldersResponseType> => {
    const auth = ctx.get("auth");

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      ctx.req.param("spaceId"),
      dataSource
    );

    if (
      !dataSource ||
      dataSource.space.sId !== spaceId ||
      dataSource.space.isConversations() ||
      !dataSource.canReadOrAdministrate(auth)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    const { limit, offset } = ctx.req.valid("query");

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const folders = await coreAPI.getDataSourceFolders(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      },
      {
        limit,
        offset,
      }
    );

    if (folders.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message: "There was an error retrieving the data source folders.",
          data_source_error: folders.error,
        },
      });
    }

    return ctx.json({
      folders: folders.value.folders,
      total: folders.value.total,
    });
  }
);

export default app;
