import apiConfig from "@app/lib/api/config";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
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

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/w/:wId/data_sources/:dsId/managed/notion_url_status.
const app = workspaceApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", PostNotionUrlStatusBodySchema),
  async (ctx): HandlerResult<PostNotionUrlStatusResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId } = ctx.req.valid("param");

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
