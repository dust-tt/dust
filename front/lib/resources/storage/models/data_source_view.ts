import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";

export class DataSourceViewModel extends Model<
  InferAttributes<DataSourceViewModel>,
  InferCreationAttributes<DataSourceViewModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare parentsIn: string[];

  declare dataSourceId: ForeignKey<DataSource["id"]>;
  declare vaultId: ForeignKey<VaultModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
DataSourceViewModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
  },
  {
    modelName: "data_source_view",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "id"] },
      { fields: ["workspaceId", "vaultId"] },
      { fields: ["workspaceId", "dataSourceId"] },
    ],
  }
);
Workspace.hasMany(DataSourceViewModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
VaultModel.hasMany(DataSourceViewModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
DataSource.hasMany(DataSourceViewModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
DataSourceViewModel.belongsTo(DataSource);
