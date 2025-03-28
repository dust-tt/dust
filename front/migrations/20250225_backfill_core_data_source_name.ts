import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import { CoreAPI } from "@app/types";

async function backfillCoreDataSourceName(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const dataSources = await DataSourceResource.listByWorkspace(
    auth,
    {
      includeDeleted: true,
    },
    true /* includeConversationDataSources*/
  );

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  await concurrentExecutor(
    dataSources,
    async (dataSource) => {
      if (execute) {
        await coreAPI.updateDataSource({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          name: dataSource.name,
        });
      } else {
        logger.info(
          { dataSourceId: dataSource.dustAPIDataSourceId },
          "Would update data source name"
        );
      }
    },
    {
      concurrency: 10,
    }
  );

  logger.info(
    { workspaceId: workspace.sId, dataSourceCount: dataSources.length },
    "Done updating data source names"
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await backfillCoreDataSourceName(workspace, logger, execute);
  });
});
