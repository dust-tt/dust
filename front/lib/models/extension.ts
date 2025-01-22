import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { ModelWithWorkspace } from "@app/lib/resources/storage/wrappers/model_with_workspace";

export class ExtensionConfigurationModel extends ModelWithWorkspace<ExtensionConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare blacklistedDomains: string[];
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
