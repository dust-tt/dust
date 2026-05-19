import { Hono } from "hono";
import { z } from "zod";

import apiConfig from "@app/lib/api/config";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";

import { validate } from "@front-api/middleware/validator";

const PostNotionUrlStatusBodySchema = z.object({
  url: z.string(),
});

// Mounted at /api/w/:wId/data_sources/:dsId/managed/notion_url_status.
const app = new Hono();

app.post("/", validate("json", PostNotionUrlStatusBodySchema), async (c) => {
  const auth = c.get("auth");
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message: "Only admins can check Notion URL status",
        },
      },
      403
    );
  }

  const dsId = c.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "Data source not found",
        },
      },
      404
    );
  }

  if (dataSource.connectorProvider !== "notion") {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Data source is not a Notion connector",
        },
      },
      400
    );
  }

  const flags = await getFeatureFlags(auth);
  if (!flags.includes("advanced_notion_management")) {
    return c.json(
      {
        error: {
          type: "feature_flag_not_found",
          message: "Advanced Notion management feature is not enabled",
        },
      },
      403
    );
  }

  if (!dataSource.connectorId) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Data source does not have a connector",
        },
      },
      400
    );
  }

  const { url } = c.req.valid("json");

  const connectorsAPI = new ConnectorsAPI(
    apiConfig.getConnectorsAPIConfig(),
    logger
  );
  const statusRes = await connectorsAPI.getNotionUrlStatus({
    connectorId: dataSource.connectorId,
    url,
  });

  if (statusRes.isErr()) {
    logger.error(
      {
        workspaceId: owner.sId,
        dataSourceId: dataSource.sId,
        error: statusRes.error,
      },
      "Failed to get Notion URL status"
    );
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to check URL status",
        },
      },
      500
    );
  }

  return c.json(statusRes.value);
});

export default app;
