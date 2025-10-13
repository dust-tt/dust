import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class WorkspaceHasDomainModel extends WorkspaceAwareModel<WorkspaceHasDomainModel> {
  declare createdAt: CreationOptional<Date>;
  declare domain: string;
  declare domainAutoJoinEnabled: CreationOptional<boolean>;
  declare updatedAt: CreationOptional<Date>;
}
WorkspaceHasDomainModel.init(
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
    domainAutoJoinEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "workspace_has_domains",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["domain"] },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);
