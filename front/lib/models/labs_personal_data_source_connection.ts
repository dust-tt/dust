import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class LabsPersonalDataSourceConnection extends WorkspaceAwareModel<LabsPersonalDataSourceConnection> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string;
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare dataSourceId: ForeignKey<DataSourceModel["id"]> | null;
}
LabsPersonalDataSourceConnection.init(
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
    connectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "labs_personal_data_source_connection",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "userId", "dataSourceId"],
        unique: true,
        name: "labs_personal_data_source_connection_unique",
      },
    ],
  }
);

UserModel.hasMany(LabsPersonalDataSourceConnection, {
  foreignKey: "userId",
});

DataSourceModel.hasMany(LabsPersonalDataSourceConnection, {
  foreignKey: "dataSourceId",
});
