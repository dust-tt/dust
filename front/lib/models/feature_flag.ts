import type { WhitelistableFeature } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { Workspace } from "@app/lib/models/workspace";

export class FeatureFlag extends Model<
  InferAttributes<FeatureFlag>,
  InferCreationAttributes<FeatureFlag>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: WhitelistableFeature;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}

FeatureFlag.init(
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
  },
  {
    sequelize: front_sequelize,
    modelName: "feature_flags",
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "name"],
      },
      {
        fields: ["workspaceId"],
      },
    ],
  }
);

Workspace.hasMany(FeatureFlag, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
FeatureFlag.belongsTo(Workspace);
