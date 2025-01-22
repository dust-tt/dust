import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { ModelWithWorkspace } from "@app/lib/resources/storage/wrappers/model_with_workspace";

export class WorkspaceHasDomain extends ModelWithWorkspace<WorkspaceHasDomain> {
  declare createdAt: CreationOptional<Date>;
  declare domain: string;
  declare domainAutoJoinEnabled: CreationOptional<boolean>;
  declare updatedAt: CreationOptional<Date>;
}
WorkspaceHasDomain.init(
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
    indexes: [{ unique: true, fields: ["domain"] }],
  }
);
