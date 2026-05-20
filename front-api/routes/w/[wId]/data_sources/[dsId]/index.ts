import { DataSourceResource } from "@app/lib/resources/data_source_resource";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

import files from "./files";
import managed from "./managed";
import usage from "./usage";

const PostDataSourceBodySchema = z
  .object({
    assistantDefaultSelected: z.boolean(),
  })
  .strict();

// Mounted under /api/w/:wId/data_sources/:dsId. The bare `/` handles POST to
// update the data source settings.
const app = new Hono();

app.post("/", validate("json", PostDataSourceBodySchema), async (ctx) => {
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
});

app.route("/files", files);
app.route("/managed", managed);
app.route("/usage", usage);

export default app;
