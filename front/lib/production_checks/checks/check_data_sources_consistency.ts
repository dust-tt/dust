import { CheckFunction } from "@app/lib/production_checks/types";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { Op, Sequelize } from "sequelize";

export const checkDataSourcesConsistency: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const dataSourcesWithoutDefaultViews = await DataSourceModel.findAll({
    where: {
      id: {
        [Op.notIn]: Sequelize.literal(
          `(SELECT DISTINCT "dataSourceId" FROM data_source_views WHERE kind='default')`
        ),
      },
    },
  });

  const defaultViewsWithIncorrectVault = await DataSourceModel.findAll({
    include: [
      {
        model: DataSourceViewModel,
        as: "dataSourceForView",
        required: false,
      },
    ],
    where: {
      [Op.and]: [
        { "$dataSourceForView.kind$": "default" },
        {
          "$data_source.vaultId$": {
            [Op.ne]: Sequelize.col("dataSourceForView.vaultId"),
          },
        },
      ],
    },
  });

  const managedDataSourcesWithoutConnector = await DataSourceModel.findAll({
    where: {
      name: { [Op.like]: "managed-%" },
      connectorId: null,
    },
  });

  if (
    dataSourcesWithoutDefaultViews.length > 0 ||
    defaultViewsWithIncorrectVault.length > 0 ||
    managedDataSourcesWithoutConnector.length > 0
  ) {
    reportFailure(
      {
        dataSourcesWithoutDefaultViews: dataSourcesWithoutDefaultViews.map(
          (ds) => ds.toJSON()
        ),
        defaultViewsWithIncorrectVault: defaultViewsWithIncorrectVault.map(
          (ds) => ds.toJSON()
        ),
        managedDataSourcesWithoutConnector:
          managedDataSourcesWithoutConnector.map((ds) => ds.toJSON()),
      },
      "Inconsistent data sources or data source views"
    );
  } else {
    reportSuccess({});
  }
};
