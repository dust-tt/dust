import { EnvironmentConfig } from "@dust-tt/types";
import { QueryTypes, Sequelize } from "sequelize";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const connectorDB = new Sequelize(
    EnvironmentConfig.getEnvVariable("CONNECTORS_DATABASE_URI")
  );

  const connectors: {
    id: number;
    workspaceId: string;
    dataSourceName: string;
  }[] = await connectorDB.query(
    `SELECT "id", "workspaceId", "dataSourceName" FROM connectors WHERE "dataSourceId" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  for (const c of connectors) {
    const auth = await Authenticator.internalAdminForWorkspace(c.workspaceId);
    const ds = await getDataSource(auth, c.dataSourceName);
    if (!ds) {
      logger.error(
        { workspaceId: c.workspaceId, dataSourceName: c.dataSourceName },
        "Failed to retrieve data source"
      );
      throw new Error("Failed to retrieve data source");
    }

    if (c.dataSourceName !== ds.name) {
      logger.error(
        {
          worksaceId: c.workspaceId,
          connectorDataSourceName: c.dataSourceName,
          dataSourceName: ds.name,
        },
        "Unexpected data source name mistmatch"
      );
      throw new Error("Unexpected data source name mistmatch");
    }

    if (execute) {
      await connectorDB.query(
        `UPDATE connectors SET "dataSourceId" = :dataSourceId WHERE id = :connectorId`,
        {
          replacements: {
            dataSourceId: ds.sId,
            connectorId: c.id,
          },
        }
      );
      logger.info(
        {
          workspaceId: c.workspaceId,
          connectorId: c.id,
          dataSourceId: ds.sId,
          dataSourceName: ds.name,
          execute,
        },
        "Updated connector"
      );
    } else {
      logger.info(
        {
          workspaceId: c.workspaceId,
          connectorId: c.id,
          dataSourceId: ds.sId,
          dataSourceName: ds.name,
          execute,
        },
        "Would have updated connector"
      );
    }
  }
});
