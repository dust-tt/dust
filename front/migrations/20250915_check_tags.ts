import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types";

makeScript(
  {
    tag: { type: "string" },
    dataSourceViewId: { type: "string" },
    workspaceId: { type: "string" },
    limit: { type: "number", default: 10 },
  },
  async ({ tag, dataSourceViewId, workspaceId, limit }, logger) => {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const dataSourceView = await DataSourceViewResource.fetchById(
      auth,
      dataSourceViewId
    );
    if (!dataSourceView) {
      throw new Error("Data source view not found");
    }

    const result = await coreAPI.searchTags({
      dataSourceViews: [dataSourceView.toJSON()],
      limit,
      query: tag,
    });
    logger.info({ result }, "Result");
  }
);
