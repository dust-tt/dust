import { Op } from "sequelize";

import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type { ActionLink, CheckFunction } from "@app/types";

export const checkDataSourcesConsistency: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const managedDataSourcesWithoutConnector = await DataSourceModel.findAll({
    where: {
      name: { [Op.like]: "managed-%" },
      connectorId: null,
    },
  });

  if (managedDataSourcesWithoutConnector.length > 0) {
    const actionLinks: ActionLink[] = managedDataSourcesWithoutConnector.map(
      (ds) => ({
        label: `Data Source: ${ds.name}`,
        url: `/poke/${ds.workspaceId}/data_sources/${ds.name}`,
      })
    );
    reportFailure(
      {
        managedDataSourcesWithoutConnector:
          managedDataSourcesWithoutConnector.map((ds) => ds.toJSON()),
        actionLinks,
      },
      "Inconsistent data sources or data source views"
    );
  } else {
    reportSuccess();
  }
};
