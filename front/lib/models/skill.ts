import isNil from "lodash/isNil";
import type { CreationOptional, ForeignKey, ModelAttributes } from "sequelize";
import { DataTypes } from "sequelize";

import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";

const SKILL_MODEL_ATTRIBUTES = {
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
  status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  agentFacingDescription: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  userFacingDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  instructions: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  requestedSpaceIds: {
    type: DataTypes.ARRAY(DataTypes.BIGINT),
    allowNull: false,
  },
  icon: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  extendedSkillId: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
} as const satisfies ModelAttributes;

/**
 * Shared validation for skill in conversation models.
 * Ensures exactly one of customSkillId or globalSkillId is set.
 */
export function eitherGlobalOrCustomSkillValidation(this: {
  customSkillId: unknown;
  globalSkillId: unknown;
}): void {
  const hasCustomSkill = !isNil(this.customSkillId);
  const hasGlobalSkill = !isNil(this.globalSkillId);
  const hasExactlyOne = hasCustomSkill !== hasGlobalSkill;
  if (!hasExactlyOne) {
    throw new Error(
      "Exactly one of customSkillId or globalSkillId must be set"
    );
  }
}

export class SkillConfigurationModel extends WorkspaceAwareModel<SkillConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: SkillStatus;

  declare name: string;
  declare agentFacingDescription: string;
  declare userFacingDescription: string;
  declare instructions: string;
  declare icon: string | null;

  declare authorId: ForeignKey<UserModel["id"]> | null;
  // Not a foreign key, only global skills can be extended.
  declare extendedSkillId: string | null;

  declare requestedSpaceIds: number[];
}

SkillConfigurationModel.init(SKILL_MODEL_ATTRIBUTES, {
  modelName: "skill_configuration",
  sequelize: frontSequelize,
  indexes: [
    {
      fields: ["workspaceId", "status"],
      concurrently: true,
    },
    {
      unique: true,
      fields: ["workspaceId", "name", "status"],
      concurrently: true,
    },
  ],
});

export class SkillVersionModel extends SkillConfigurationModel {
  declare skillConfigurationId: ForeignKey<SkillConfigurationModel["id"]>;
  declare mcpServerViewIds: number[];
  declare version: number;
}

SkillVersionModel.init(
  {
    ...SKILL_MODEL_ATTRIBUTES,
    skillConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    mcpServerViewIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "skill_version",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "skillConfigurationId"],
        concurrently: true,
      },
      {
        unique: true,
        fields: ["workspaceId", "skillConfigurationId", "version"],
        concurrently: true,
      },
    ],
  }
);

// Skill config <> Author
UserModel.hasMany(SkillConfigurationModel, {
  foreignKey: { name: "authorId", allowNull: true },
  onDelete: "RESTRICT",
});
SkillConfigurationModel.belongsTo(UserModel, {
  foreignKey: { name: "authorId", allowNull: true },
  as: "author",
});

// Skill version <> Author
UserModel.hasMany(SkillVersionModel, {
  foreignKey: { name: "authorId", allowNull: true },
  onDelete: "RESTRICT",
});
SkillVersionModel.belongsTo(UserModel, {
  foreignKey: { name: "authorId", allowNull: true },
  as: "author",
});

// Skill MCP Server Configuration (tools associated with a skill)
export class SkillMCPServerConfigurationModel extends WorkspaceAwareModel<SkillMCPServerConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare skillConfigurationId: ForeignKey<SkillConfigurationModel["id"]>;
  declare mcpServerViewId: ForeignKey<MCPServerViewModel["id"]>;
}

SkillMCPServerConfigurationModel.init(
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
    mcpServerViewId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: MCPServerViewModel,
        key: "id",
      },
    },
  },
  {
    modelName: "skill_mcp_server_configuration",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "skillConfigurationId"],
        name: "idx_skill_mcp_server_config_workspace_skill_config",
      },
    ],
  }
);

// Skill config <> MCP Server Configuration
SkillConfigurationModel.hasMany(SkillMCPServerConfigurationModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "mcpServerConfigurations",
});
SkillMCPServerConfigurationModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  as: "skillConfiguration",
});

// Skill MCP Server Configuration <> MCP Server View
MCPServerViewModel.hasMany(SkillMCPServerConfigurationModel, {
  foreignKey: { name: "mcpServerViewId", allowNull: false },
  onDelete: "RESTRICT",
});
SkillMCPServerConfigurationModel.belongsTo(MCPServerViewModel, {
  foreignKey: { name: "mcpServerViewId", allowNull: false },
  as: "mcpServerView",
});

SkillConfigurationModel.hasMany(SkillVersionModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "versions",
});
SkillVersionModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  as: "skillConfiguration",
});

/**
 * Configuration of Data Sources used by Skills for knowledge attachments.
 */

export class SkillDataSourceConfigurationModel extends WorkspaceAwareModel<SkillDataSourceConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentsIn: string[];

  declare skillConfigurationId: ForeignKey<SkillConfigurationModel["id"]>;
  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;
}

SkillDataSourceConfigurationModel.init(
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
    skillConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    dataSourceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    dataSourceViewId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
  },
  {
    modelName: "skill_data_source_configuration",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "skillConfigurationId"],
        name: "idx_skill_data_source_config_workspace_skill_config",
      },
      {
        fields: ["workspaceId", "dataSourceId"],
        name: "idx_skill_data_source_config_workspace_data_source",
      },
      {
        fields: ["workspaceId", "dataSourceViewId"],
        name: "idx_skill_data_source_config_workspace_data_source_view",
      },
      {
        fields: ["workspaceId", "skillConfigurationId", "dataSourceViewId"],
        name: "idx_skill_data_source_config_workspace_skill_data_source_view",
        unique: true,
      },
    ],
  }
);

SkillConfigurationModel.hasMany(SkillDataSourceConfigurationModel, {
  foreignKey: "skillConfigurationId",
});

SkillDataSourceConfigurationModel.belongsTo(SkillConfigurationModel, {
  foreignKey: "skillConfigurationId",
});

SkillDataSourceConfigurationModel.belongsTo(DataSourceModel, {
  foreignKey: "dataSourceId",
});

SkillDataSourceConfigurationModel.belongsTo(DataSourceViewModel, {
  foreignKey: "dataSourceViewId",
});
