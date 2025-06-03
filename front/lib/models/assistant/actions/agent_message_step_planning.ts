import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentMessageStepPlanning extends WorkspaceAwareModel<AgentMessageStepPlanning> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;

  declare step: number;
  declare stepActionIndex: number;

  // We map what we have in AgentActionsEvent.
  declare actionConfiguration: ActionConfigurationType;
  declare actionInputs: Record<string, string | boolean | number>;
  declare actionSpecification: AgentActionSpecification | null;
  declare functionCallId: string | null;
}

AgentMessageStepPlanning.init(
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
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    stepActionIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    actionConfiguration: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    actionInputs: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    actionSpecification: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    functionCallId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "agent_message_step_plannings",
    indexes: [
      {
        fields: ["agentMessageId", "step", "stepActionIndex"],
        name: "agent_message_step_plannings_agent_message_id_step_action_index",
        unique: true,
      },
    ],
  }
);

AgentMessageStepPlanning.belongsTo(AgentMessage, {
  as: "agentMessage",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
  onUpdate: "RESTRICT",
});

AgentMessage.hasMany(AgentMessageStepPlanning, {
  as: "agentMessageStepPlannings",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
  onUpdate: "RESTRICT",
});
