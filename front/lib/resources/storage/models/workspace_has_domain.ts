import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { DomainUseCase } from "@app/types/domain";

export class WorkspaceHasDomainModel extends WorkspaceAwareModel<WorkspaceHasDomainModel> {
  declare createdAt: CreationOptional<Date>;
  declare domain: string;
  declare domainAutoJoinEnabled: CreationOptional<boolean>;
  declare useCases: DomainUseCase[];
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
    useCases: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: ["sso"],
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
