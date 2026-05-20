import apiConfig from "@app/lib/api/config";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type PostNotionUrlStatusResponseBody = {
  notion: {
    exists: boolean;
    type?: "page" | "database";
  };
  dust: {
    synced: boolean;
    lastSync?: string;
    breadcrumbs?: Array<{
      id: string;
      title: string;
      type: "page" | "database" | "workspace";
    }>;
  };
  summary: string;
};

const PostNotionUrlStatusBodySchema = z.object({
  url: z.string(),
});

// Mounted at /api/w/:wId/data_sources/:dsId/managed/notion_url_status.
const app = new Hono();

app.post(
  "/",
  validate("json", PostNotionUrlStatusBodySchema),
  async (ctx): HandlerResult<PostNotionUrlStatusResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only admins can check Notion URL status",
        },
      });
    }

    const dsId = ctx.req.param("dsId") ?? "";

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "Data source not found",
        },
      });
    }

    if (dataSource.connectorProvider !== "notion") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Data source is not a Notion connector",
        },
      });
    }

    const flags = await getFeatureFlags(auth);
    if (!flags.includes("advanced_notion_management")) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: "Advanced Notion management feature is not enabled",
        },
      });
    }

    if (!dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Data source does not have a connector",
        },
      });
    }

    const { url } = ctx.req.valid("json");

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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to check URL status",
        },
      });
    }

    return ctx.json(statusRes.value);
  }
);

export default app;
