import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";

// Source: https://docs.google.com/spreadsheets/d/1dUnETLW0grjMe-zxuIb9PDlIYdIgt3eKWFQVUhdmkto
const RATE_LIMITED_SLACK_CONNECTORS = {
  EU: [274877908661, 274877908648, 274877908541, 274877908701],
  US: [
    23805, 24310, 24051, 23922, 24801, 24505, 24879, 23936, 23697, 23852, 23876,
    24171, 23844, 24266, 24295, 23164, 23978, 24432, 24875, 24948, 24272, 24080,
    23796, 23917, 23760, 23786, 24536, 24378, 24838, 24768, 24754, 23840, 23726,
    24581, 24497, 23913, 24075, 24750, 24114, 24878, 24712, 23741, 24385, 23703,
    24090, 23919, 24606, 24623, 24588, 24268, 24287, 23756, 24289, 24302, 24473,
    23791, 24659, 23717, 24400,
  ],
  DEV: [11],
};

makeScript(
  {
    region: {
      type: "string",
      choices: ["EU", "US", "DEV"],
    },
  },
  async ({ region, execute }, logger) => {
    const connectorIds =
      RATE_LIMITED_SLACK_CONNECTORS[
        region as keyof typeof RATE_LIMITED_SLACK_CONNECTORS
      ];
    if (!connectorIds) {
      throw new Error(`Invalid region`);
    }

    for (const connectorId of connectorIds) {
      logger.info(
        { connectorId, region, execute },
        `Deleting rate-limited Slack connection with ID ${connectorId}`
      );

      const ds = await DataSourceModel.findOne({
        where: {
          connectorId: String(connectorId),
        },
      });

      if (!ds) {
        logger.warn({ connectorId }, `No data source found for connector ID`);
        continue;
      }

      const workspace = await WorkspaceModel.findOne({
        where: {
          id: ds.workspaceId,
        },
      });
      if (!workspace) {
        logger.warn(
          { connectorId, workspaceId: ds.workspaceId },
          `No workspace found for data source`
        );
        continue;
      }

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      const dataSource = await DataSourceResource.fetchById(
        auth,
        DataSourceResource.modelIdToSId({
          id: ds.id,
          workspaceId: workspace.id,
        })
      );

      if (!dataSource) {
        logger.warn(
          { connectorId, dataSourceId: ds.id },
          `Data source resource not found for connector ID`
        );
        continue;
      }

      if (execute) {
      }
      await execute({
        type: "delete",
        resource: "slack_connection",
        id: connectorId,
      });
    }
  }
);
