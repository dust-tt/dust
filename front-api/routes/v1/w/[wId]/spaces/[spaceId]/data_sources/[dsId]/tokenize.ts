import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { TokenizeResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PostDatasourceTokenizeBody = {
  text: string;
};

const PostDatasourceTokenizeBodySchema = z.object({
  text: z.string(),
});

const ParamsSchema = z.object({
  dsId: z.string(),
  spaceId: z.string().optional(),
});

/**
 * @ignoreswagger
 * This endpoint is not to be included in the public API docs.
 */
// At 5mn, likeliness of connection close increases significantly. The timeout is set at 4mn30.
const CORE_TOKENIZE_TIMEOUT_MS = 270000;

// Mounted at /api/v1/w/:wId/spaces/:spaceId/data_sources/:dsId/tokenize.
const app = publicApiApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostDatasourceTokenizeBodySchema),
  async (ctx): HandlerResult<TokenizeResponseType> => {
    const auth = ctx.get("auth");
    const { dsId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tokenize" }
    );

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      spaceIdParam,
      dataSource
    );

    if (
      !dataSource ||
      dataSource.space.sId !== spaceId ||
      !dataSource.canRead(auth)
    ) {
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

    const { text } = ctx.req.valid("json");
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const coreTokenizeRes = await coreAPI.dataSourceTokenize(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        text,
      },
      { timeoutMs: CORE_TOKENIZE_TIMEOUT_MS }
    );
    if (coreTokenizeRes.isErr()) {
      const isTimeout = coreTokenizeRes.error.code === "request_timeout";
      return apiError(ctx, {
        status_code: isTimeout ? 504 : 500,
        api_error: {
          type: "internal_server_error",
          message: `Error tokenizing text: ${coreTokenizeRes.error.message}`,
          data_source_error: coreTokenizeRes.error,
        },
      });
    }
    const tokens = coreTokenizeRes.value.tokens;
    return ctx.json({ tokens });
  }
);

export default app;
