import { Op } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";

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
    reportFailure(
      {
        managedDataSourcesWithoutConnector:
          managedDataSourcesWithoutConnector.map((ds) => ds.toJSON()),
      },
      "Inconsistent data sources or data source views"
    );
  } else {
    reportSuccess({});
  }
};
