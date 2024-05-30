import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";

export class ScheduledAgentModel extends Model<
  InferAttributes<ScheduledAgentModel>,
  InferCreationAttributes<ScheduledAgentModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare name: string;

  // User ID of the user who scheduled the action.
  declare userId: ForeignKey<User["id"]>;
  // ID of the workspace where the action is scheduled.
  declare workspaceId: ForeignKey<Workspace["id"]>;

  // SID of the agent configuration to run.
  declare agentConfigurationId: string;
  // Prompt to use for the agent (optional).
  declare prompt: string | null;

  // Required for any schedule type.
  // Format: "HH:MM:SS"
  declare timeOfDay: string;
  declare timeZone: string;

  declare scheduleType: "weekly" | "monthly";

  // Weekly schedule fields.
  declare weeklyDaysOfWeek: number[] | null;

  // Monthly schedule fields.
  declare monthlyFirstLast: "first" | "last" | null;
  declare monthlyDayOfWeek: number | null;

  // Destination fields.
  declare emails: string[] | null;
  declare slackChannelId: string | null;
}

ScheduledAgentModel.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
    },
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    prompt: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    timeOfDay: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    timeZone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    scheduleType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    weeklyDaysOfWeek: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
    },
    monthlyFirstLast: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    monthlyDayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    emails: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    slackChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "scheduled_agents",
    indexes: [
      { fields: ["userId"] },
      { fields: ["agentConfigurationId"] },
      { fields: ["workspaceId"] },
    ],
  }
);

User.hasMany(ScheduledAgentModel);
ScheduledAgentModel.belongsTo(User);
Workspace.hasMany(ScheduledAgentModel);
ScheduledAgentModel.belongsTo(Workspace);
