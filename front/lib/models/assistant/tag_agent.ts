import type { BelongsToGetAssociationMixin, CreationOptional, ForeignKey, NonAttribute, } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { TagModel } from "@app/lib/models/tags";
import { frontSequelize } from "@app/lib/resources/storage";
import type { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class TagAgentModel extends WorkspaceAwareModel<TagAgentModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare tag: NonAttribute<TagModel>;
  declare tagId: ForeignKey<TagModel["id"]>;

  declare agentConfiguration: NonAttribute<AgentConfiguration>;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;
  // workspaceId is inherited from WorkspaceAwareModel

  declare getGroup: BelongsToGetAssociationMixin<GroupModel>;
  declare getAgentConfiguration: BelongsToGetAssociationMixin<AgentConfiguration>;
}

TagAgentModel.init(
  {
    id: {
      type: DataTypes.BIGINT,
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
    tagId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    agentConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "tag_agents",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["tagId", "agentConfigurationId"],
      },
      { fields: ["agentConfigurationId"] },
      { fields: ["workspaceId", "agentConfigurationId"] },
    ],
  }
);

// Define associations

// Association with Tag
TagAgentModel.belongsTo(TagModel, {
  foreignKey: { name: "tagId", allowNull: false },
  targetKey: "id",
  onDelete: "RESTRICT",
});
TagModel.hasMany(TagAgentModel, {
  foreignKey: { name: "tagId", allowNull: false },
  sourceKey: "id",
  as: "tagAgentLinks",
  onDelete: "RESTRICT",
});

// Association with AgentConfiguration
TagAgentModel.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  targetKey: "id",
  onDelete: "RESTRICT",
});
AgentConfiguration.hasMany(TagAgentModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  sourceKey: "id",
  as: "agentTagLinks",
  onDelete: "RESTRICT",
});

// Many-to-Many between Tags and AgentConfiguration (ensure FKs match)
TagModel.belongsToMany(AgentConfiguration, {
  through: TagAgentModel,
  foreignKey: "tagId",
  otherKey: "agentConfigurationId",
  as: "agentConfigurations",
  onDelete: "RESTRICT",
});
AgentConfiguration.belongsToMany(TagModel, {
  through: TagAgentModel,
  foreignKey: "agentConfigurationId",
  otherKey: "tagId",
  as: "tags",
  onDelete: "RESTRICT",
});

// Workspace association is handled by WorkspaceAwareModel.init
