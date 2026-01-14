import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  WorkspaceDomainUseCase,
  WorkspaceDomainUseCaseStatus,
} from "@app/types";

export class WorkspaceDomainUseCaseModel extends WorkspaceAwareModel<WorkspaceDomainUseCaseModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare domain: string;
  declare useCase: WorkspaceDomainUseCase;
  declare status: WorkspaceDomainUseCaseStatus;
}

WorkspaceDomainUseCaseModel.init(
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
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useCase: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    modelName: "workspace_domain_use_cases",
    sequelize: frontSequelize,
    indexes: [
      // Unique constraint: one entry per (workspace, domain, useCase)
      {
        unique: true,
        fields: ["workspaceId", "domain", "useCase"],
        name: "workspace_domain_use_cases_unique_idx",
      },
      // For lookups by workspace and use case (e.g., find all MCP domains)
      {
        fields: ["workspaceId", "useCase"],
        concurrently: true,
      },
      // For lookups by workspace and domain (e.g., find all use cases for a domain)
      {
        fields: ["workspaceId", "domain"],
        concurrently: true,
      },
    ],
  }
);
