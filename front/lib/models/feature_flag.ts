import type { WhitelistableFeature } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class FeatureFlag extends BaseModel<FeatureFlag> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: WhitelistableFeature;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}

FeatureFlag.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
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
