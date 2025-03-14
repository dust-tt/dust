import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { DataSourceViewKind } from "@app/types";

export class DataSourceViewModel extends SoftDeletableWorkspaceAwareModel<DataSourceViewModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Corresponds to the ID of the last user to configure the connection.
  declare editedByUserId: ForeignKey<UserModel["id"]> | null;
  declare editedAt: Date;

  declare kind: DataSourceViewKind;
  declare parentsIn: string[] | null;

  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare vaultId: ForeignKey<SpaceModel["id"]>;

  declare dataSourceForView: NonAttribute<DataSourceModel>;
  declare editedByUser: NonAttribute<UserModel>;
  declare space: NonAttribute<SpaceModel>;
}
DataSourceViewModel.init(
  {
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

SpaceModel.hasMany(DataSourceViewModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
  onDelete: "RESTRICT",
});
DataSourceViewModel.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
});

DataSourceModel.hasMany(DataSourceViewModel, {
  as: "dataSourceForView",
  foreignKey: { name: "dataSourceId", allowNull: false },
  onDelete: "RESTRICT",
});
DataSourceViewModel.belongsTo(DataSourceModel, {
  as: "dataSourceForView",
  foreignKey: { name: "dataSourceId", allowNull: false },
});

DataSourceViewModel.belongsTo(UserModel, {
  as: "editedByUser",
  foreignKey: { name: "editedByUserId", allowNull: true },
});

DataSourceViewModel.hasMany(ContentFragmentModel, {
  foreignKey: { name: "nodeDataSourceViewId", allowNull: true },
});
ContentFragmentModel.belongsTo(DataSourceViewModel, {
  foreignKey: { name: "nodeDataSourceViewId", allowNull: true },
});
