import apiConfig from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withDataSource } from "@front-api/middlewares/with_data_source";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  fId: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/folders/:fId.
const app = workspaceApp();

/** @ignoreswagger */
app.delete(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSource({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");
    const { fId } = ctx.req.valid("param");

    if (!dataSource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to delete data in this data source.",
        },
      });
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const delRes = await coreAPI.deleteDataSourceFolder({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      folderId: fId,
    });
    if (delRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error deleting the folder.",
          data_source_error: delRes.error,
        },
      });
    }

    return ctx.body(null, 204);
  }
);

export default app;
