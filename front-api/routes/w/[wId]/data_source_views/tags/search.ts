import { Hono } from "hono";
import { z } from "zod";

import apiConfig from "@app/lib/api/config";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";

import { validate } from "@front-api/middleware/validator";

const PostTagSearchBodySchema = z.object({
  query: z.string(),
  queryType: z.enum(["exact", "prefix", "match"]),
  dataSourceViewIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/data_source_views/tags/search.
const app = new Hono();

app.post("/", validate("json", PostTagSearchBodySchema), async (c) => {
  const auth = c.get("auth");

  // workspaceAuth already enforces auth.isUser().
  const { dataSourceViewIds, query, queryType } = c.req.valid("json");

  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    dataSourceViewIds
  );
  if (dataSourceViews.some((dsv) => !dsv.canRead(auth))) {
    return c.json(
      {
        error: {
          type: "data_source_auth_error",
          message: "You are not authorized to fetch tags.",
        },
      },
      403
    );
  }

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const result = await coreAPI.searchTags({
    query,
    queryType,
    dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
  });

  if (result.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to search tags",
        },
      },
      500
    );
  }

  return c.json(result.value);
});

export default app;
