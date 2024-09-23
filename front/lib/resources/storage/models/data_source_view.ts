import type { DataSourceViewKind } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";

export class DataSourceViewModel extends Model<
  InferAttributes<DataSourceViewModel>,
  InferCreationAttributes<DataSourceViewModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Corresponds to the ID of the last user to configure the connection.
  declare editedByUserId: ForeignKey<User["id"]>;
  declare editedAt: CreationOptional<Date>;

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
    editedAt: {
      type: DataTypes.DATE,
      // TODO(2024-08-28 (thomas) Set `allowNull` to `false` once backfilled.
      allowNull: true,
      defaultValue: DataTypes.NOW,
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
      { fields: ["workspaceId", "dataSourceId", "vaultId"], unique: true },
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
  // TODO(2024-08-28 (thomas) Set `allowNull` to `false` once backfilled.
  foreignKey: { name: "editedByUserId", allowNull: true },
});
