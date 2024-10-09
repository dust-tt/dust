import type { DataSourceViewKind } from "@dust-tt/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import { SoftDeletableModel } from "@app/lib/resources/storage/wrappers";

export class DataSourceViewModel extends SoftDeletableModel<DataSourceViewModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Corresponds to the ID of the last user to configure the connection.
  declare editedByUserId: ForeignKey<User["id"]>;
  declare editedAt: Date;

  declare kind: DataSourceViewKind;
  declare parentsIn: string[] | null;

  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare vaultId: ForeignKey<VaultModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare dataSourceForView: NonAttribute<DataSourceModel>;
  declare editedByUser: NonAttribute<User>;
  declare vault: NonAttribute<VaultModel>;
  declare workspace: NonAttribute<Workspace>;
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
    deletedAt: {
      type: DataTypes.DATE,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "default",
    },
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    modelName: "data_source_view",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "id"] },
      { fields: ["workspaceId", "vaultId"] },
      {
        fields: ["workspaceId", "dataSourceId", "vaultId", "deletedAt"],
        unique: true,
        name: "data_source_view_workspace_data_source_vault_deleted_at_unique",
      },
    ],
  }
);
Workspace.hasMany(DataSourceViewModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
DataSourceViewModel.belongsTo(Workspace);

VaultModel.hasMany(DataSourceViewModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
DataSourceViewModel.belongsTo(VaultModel);

DataSourceModel.hasMany(DataSourceViewModel, {
  as: "dataSourceForView",
  foreignKey: { name: "dataSourceId", allowNull: false },
  onDelete: "RESTRICT",
});
DataSourceViewModel.belongsTo(DataSourceModel, {
  as: "dataSourceForView",
  foreignKey: { name: "dataSourceId", allowNull: false },
});

DataSourceViewModel.belongsTo(User, {
  as: "editedByUser",
  foreignKey: { name: "editedByUserId", allowNull: false },
});
