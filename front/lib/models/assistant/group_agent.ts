import type {
  BelongsToGetAssociationMixin,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class GroupAgentModel extends WorkspaceAwareModel<GroupAgentModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;
  // workspaceId is inherited from WorkspaceAwareModel

  declare getGroup: BelongsToGetAssociationMixin<GroupModel>;
  declare getAgentConfiguration: BelongsToGetAssociationMixin<AgentConfiguration>;
  // getWorkspace is inherited
}

GroupAgentModel.init(
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
    groupId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    agentConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // workspaceId is automatically added by WorkspaceAwareModel.init
  },
  {
    modelName: "group_agents",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["groupId", "agentConfigurationId"],
      },
      { fields: ["agentConfigurationId"] },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);

// Define associations

// Association with Group
GroupAgentModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  targetKey: "id",
});
GroupModel.hasMany(GroupAgentModel, {
  foreignKey: { name: "groupId", allowNull: false },
  sourceKey: "id",
  as: "groupAgentLinks",
});

// Association with AgentConfiguration
GroupAgentModel.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  targetKey: "id",
});
AgentConfiguration.hasMany(GroupAgentModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  sourceKey: "id",
  as: "agentGroupLinks",
});

// Many-to-Many between Group and AgentConfiguration (ensure FKs match)
GroupModel.belongsToMany(AgentConfiguration, {
  through: GroupAgentModel,
  foreignKey: "groupId",
  otherKey: "agentConfigurationId",
  as: "agentConfigurations",
});
AgentConfiguration.belongsToMany(GroupModel, {
  through: GroupAgentModel,
  foreignKey: "agentConfigurationId",
  otherKey: "groupId",
  as: "groups",
});

// Workspace association is handled by WorkspaceAwareModel.init
