import type { WebsearchActionOutputType } from "@dust-tt/types/dist/front/assistant/actions/websearch";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";

export class AgentWebsearchConfiguration extends Model<
  InferAttributes<AgentWebsearchConfiguration>,
  InferCreationAttributes<AgentWebsearchConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare name: string | null;
  declare description: string | null;
  declare forceUseAtIteration: number | null;
}

AgentWebsearchConfiguration.init(
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
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    forceUseAtIteration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    modelName: "agent_websearch_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentConfiguration.hasMany(AgentWebsearchConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentWebsearchConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

export class AgentWebsearchAction extends Model<
  InferAttributes<AgentWebsearchAction>,
  InferCreationAttributes<AgentWebsearchAction>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare websearchConfigurationId: string;

  declare query: string;

  declare output: WebsearchActionOutputType | null;
  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}
AgentWebsearchAction.init(
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

    websearchConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    query: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    output: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    functionCallId: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    functionCallName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "agent_websearch_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentWebsearchAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentWebsearchAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
