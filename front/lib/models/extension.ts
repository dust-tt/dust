import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class ExtensionConfigurationModel extends BaseModel<ExtensionConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare blacklistedDomains: string[];

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare workspace: NonAttribute<Workspace>;
}
ExtensionConfigurationModel.init(
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
    blacklistedDomains: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    modelName: "extension_configuration",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["workspaceId"] }],
  }
);

Workspace.hasOne(ExtensionConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

ExtensionConfigurationModel.belongsTo(Workspace, {
  foreignKey: { allowNull: false },
});
