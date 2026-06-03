import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceType } from "@app/types/data_source";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import files from "./files";
import managed from "./managed";
import usage from "./usage";

export type GetOrPostDataSourceResponseBody = {
  dataSource: DataSourceType;
};

const PostDataSourceBodySchema = z
  .object({
    assistantDefaultSelected: z.boolean(),
  })
  .strict();

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted under /api/w/:wId/data_sources/:dsId. The bare `/` handles POST to
// update the data source settings.
const app = workspaceApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostDataSourceBodySchema),
  async (ctx): HandlerResult<GetOrPostDataSourceResponseBody> => {
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

    if (!dataSource.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "You do not have permission to access this data source's settings.",
        },
      });
    }

    const { assistantDefaultSelected } = ctx.req.valid("json");
    await dataSource.setDefaultSelectedForAssistant(assistantDefaultSelected);

    return ctx.json({ dataSource: dataSource.toJSON() });
  }
);

app.route("/files", files);
app.route("/managed", managed);
app.route("/usage", usage);

export default app;
