import { Hono } from "hono";
import { z } from "zod";

import { DataSourceResource } from "@app/lib/resources/data_source_resource";

import { validate } from "@front-api/middleware/validator";

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

app.post("/", validate("json", PostDataSourceBodySchema), async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      },
      404
    );
  }

  if (!dataSource.canAdministrate(auth)) {
    return c.json(
      {
        error: {
          type: "data_source_auth_error",
          message:
            "You do not have permission to access this data source's settings.",
        },
      },
      403
    );
  }

  const { assistantDefaultSelected } = c.req.valid("json");
  await dataSource.setDefaultSelectedForAssistant(assistantDefaultSelected);

  return c.json({ dataSource: dataSource.toJSON() });
});

app.route("/files", files);
app.route("/managed", managed);
app.route("/usage", usage);

export default app;
