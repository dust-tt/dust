import { connectorsSequelize } from "@connectors/resources/storage";
import { DataTypes } from "@connectors/resources/storage/data_types";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CreationOptional } from "sequelize";

export class BigQueryConfigurationModel extends ConnectorBaseModel<BigQueryConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare useMetadataForDBML: boolean;
}
BigQueryConfigurationModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    useMetadataForDBML: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "bigquery_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
