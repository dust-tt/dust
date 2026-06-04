import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { DataSourceType } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import checkStuck from "./check-stuck";
import config from "./config";
import details from "./details";
import document from "./document";
import documents from "./documents";
import managed from "./managed";
import query from "./query";
import search from "./search";
import tables from "./tables";

export type DeleteDataSourceResponseBody = DataSourceType;

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId.
const app = pokeApp();

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DeleteDataSourceResponseBody> => {
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

    const dataSourceViews = await DataSourceViewResource.listForDataSources(
      auth,
      [dataSource]
    );
    const viewsUsageByAgentsRes = await Promise.all(
      dataSourceViews.map((view) => view.getUsagesByAgents(auth))
    );

    const viewsUsedByAgentsName = viewsUsageByAgentsRes.reduce(
      (acc, usageRes) => {
        if (usageRes.isOk() && usageRes.value.count > 0) {
          usageRes.value.agents
            .map((a) => a.name)
            .forEach((name) => acc.add(name));
        }
        return acc;
      },
      new Set<string>()
    );

    if (viewsUsedByAgentsName.size > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The data source is in use by ${viewsUsedByAgentsName.size} agent(s) [${Array.from(viewsUsedByAgentsName).join(", ")}].`,
        },
      });
    }

    const delRes = await softDeleteDataSourceAndLaunchScrubWorkflow(auth, {
      dataSource,
    });
    if (delRes.isErr()) {
      switch (delRes.error.code) {
        case "unauthorized_deletion":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: `You are not authorized to delete this data source: ${delRes.error.message}`,
            },
          });
        default:
          assertNever(delRes.error.code);
      }
    }

    return ctx.json(delRes.value);
  }
);

app.route("/check-stuck", checkStuck);
app.route("/config", config);
app.route("/details", details);
app.route("/document", document);
app.route("/documents", documents);
app.route("/managed", managed);
app.route("/query", query);
app.route("/search", search);
app.route("/tables", tables);

export default app;
