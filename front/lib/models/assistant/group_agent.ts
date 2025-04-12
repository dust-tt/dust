import type {
  BelongsToGetAssociationMixin,
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { frontSequelize } from "@app/lib/resources/storage";

export class GroupAgentModel extends Model<
  InferAttributes<GroupAgentModel>,
  InferCreationAttributes<GroupAgentModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare getGroup: BelongsToGetAssociationMixin<GroupModel>;
  declare getAgentConfiguration: BelongsToGetAssociationMixin<AgentConfiguration>;
}

GroupAgentModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
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
    // Foreign keys are defined in the associations section below
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
    ],
  }
);

// Define associations
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

GroupAgentModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  targetKey: "id",
});
GroupAgentModel.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  targetKey: "id",
});

GroupModel.hasMany(GroupAgentModel, {
  foreignKey: { name: "groupId", allowNull: false },
  sourceKey: "id",
});
AgentConfiguration.hasMany(GroupAgentModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  sourceKey: "id",
});
