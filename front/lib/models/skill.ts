import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { SkillStatus } from "@app/types/skill_configuration";

export class SkillConfigurationModel extends WorkspaceAwareModel<SkillConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare version: number;

  declare status: SkillStatus;

  declare name: string;
  declare description: string;
  declare instructions: string;

  declare authorId: ForeignKey<UserModel["id"]>;

  declare requestedSpaceIds: number[];

  declare author: NonAttribute<UserModel>;
  declare mcpServerConfigurations: NonAttribute<
    SkillMCPServerConfigurationModel[]
  >;
}

SkillConfigurationModel.init(
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    requestedSpaceIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: false,
    },
  },
  {
    modelName: "skill_configuration",
    sequelize: frontSequelize,
    indexes: [
      // TODO(skills): add indexes.
    ],
  }
);

// Skill config <> Author
UserModel.hasMany(SkillConfigurationModel, {
  foreignKey: { name: "authorId", allowNull: false },
  onDelete: "RESTRICT",
});
SkillConfigurationModel.belongsTo(UserModel, {
  foreignKey: { name: "authorId", allowNull: false },
  as: "author",
});

// Skill MCP Server Configuration (tools associated with a skill)
export class SkillMCPServerConfigurationModel extends WorkspaceAwareModel<SkillMCPServerConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare skillConfigurationId: ForeignKey<SkillConfigurationModel["id"]>;
  declare mcpServerViewId: ForeignKey<MCPServerViewModel["id"]>;

  declare skillConfiguration: NonAttribute<SkillConfigurationModel>;
  declare mcpServerView: NonAttribute<MCPServerViewModel>;
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
  onDelete: "CASCADE",
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
