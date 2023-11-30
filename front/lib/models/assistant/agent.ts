import { DustAppRunConfigurationType } from "@dust-tt/types";
import {
  AgentConfigurationScope,
  AgentStatus,
  AgentVisibilityOverrideType,
  GlobalAgentStatus,
} from "@dust-tt/types";
import assert from "assert";
import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { Membership, Workspace } from "@app/lib/models/workspace";

import { AgentDustAppRunConfiguration } from "./actions/dust_app_run";

/**
 * Configuration of Agent generation.
 */
export class AgentGenerationConfiguration extends Model<
  InferAttributes<AgentGenerationConfiguration>,
  InferCreationAttributes<AgentGenerationConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare prompt: string;
  declare providerId: string;
  declare modelId: string;
  declare temperature: number;
}
AgentGenerationConfiguration.init(
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
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.7,
    },
  },
  {
    modelName: "agent_generation_configuration",
    sequelize: front_sequelize,
  }
);

/**
 * Agent configuration
 */
export class AgentConfiguration extends Model<
  InferAttributes<AgentConfiguration>,
  InferCreationAttributes<AgentConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare version: number;

  declare status: AgentStatus;
  declare scope: Exclude<AgentConfigurationScope, "global">;
  declare name: string;
  declare description: string;
  declare pictureUrl: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare generationConfigurationId: ForeignKey<
    AgentGenerationConfiguration["id"]
  > | null;
  declare retrievalConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  > | null;
  declare dustAppRunConfigurationId: ForeignKey<
    AgentDustAppRunConfiguration["id"]
  > | null;

  declare generationConfiguration: NonAttribute<AgentGenerationConfiguration>;
  declare retrievalConfiguration: NonAttribute<AgentRetrievalConfiguration>;
  declare dustAppRunConfiguration: NonAttribute<DustAppRunConfigurationType>;
}
AgentConfiguration.init(
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    scope: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "workspace",
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    pictureUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "agent_configuration",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "name"] },
      { fields: ["sId"] },
      { fields: ["sId", "version"], unique: true },
    ],
    hooks: {
      beforeValidate: (agentConfiguration: AgentConfiguration) => {
        if (
          agentConfiguration.retrievalConfigurationId &&
          agentConfiguration.dustAppRunConfigurationId
        ) {
          throw new Error(
            "retrievalConfigurationId and dutappRunConfigurationId must be exclusive"
          );
        }
      },
    },
  }
);

//  Agent config <> Workspace
Workspace.hasMany(AgentConfiguration, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
AgentConfiguration.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

// Agent config <> Generation config
AgentGenerationConfiguration.hasOne(AgentConfiguration, {
  as: "generationConfiguration",
  foreignKey: { name: "generationConfigurationId", allowNull: true }, // null = no generation set for this Agent
});
AgentConfiguration.belongsTo(AgentGenerationConfiguration, {
  as: "generationConfiguration",
  foreignKey: { name: "generationConfigurationId", allowNull: true }, // null = no generation set for this Agent
});

// Agent config <> Retrieval config
AgentRetrievalConfiguration.hasOne(AgentConfiguration, {
  as: "retrievalConfiguration",
  foreignKey: { name: "retrievalConfigurationId", allowNull: true }, // null = no retrieval action set for this Agent
});
AgentConfiguration.belongsTo(AgentRetrievalConfiguration, {
  as: "retrievalConfiguration",
  foreignKey: { name: "retrievalConfigurationId", allowNull: true }, // null = no retrieval action set for this Agent
});

// Agent config <> DustAppRun config
AgentDustAppRunConfiguration.hasOne(AgentConfiguration, {
  as: "dustAppRunConfiguration",
  foreignKey: { name: "dustAppRunConfigurationId", allowNull: true }, // null = no DutsAppRun action set for this Agent
});
AgentConfiguration.belongsTo(AgentDustAppRunConfiguration, {
  as: "dustAppRunConfiguration",
  foreignKey: { name: "dustAppRunConfigurationId", allowNull: true }, // null = no DutsAppRun action set for this Agent
});

/**
 * Global Agent settings
 */
export class GlobalAgentSettings extends Model<
  InferAttributes<GlobalAgentSettings>,
  InferCreationAttributes<GlobalAgentSettings>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentId: string;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare status: GlobalAgentStatus;
}
GlobalAgentSettings.init(
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
    agentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "disabled",
    },
  },
  {
    modelName: "global_agent_settings",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "agentId"], unique: true },
    ],
  }
);
//  Global Agent config <> Workspace
Workspace.hasMany(GlobalAgentSettings, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
GlobalAgentSettings.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

export class MemberAgentVisibility extends Model<
  InferAttributes<MemberAgentVisibility>,
  InferCreationAttributes<MemberAgentVisibility>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare visibility: AgentVisibilityOverrideType;

  declare membershipId: ForeignKey<Membership["id"]>;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;
}

MemberAgentVisibility.init(
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

    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "member_agent_visibility",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["membershipId"] },
      { fields: ["agentConfigurationId", "membershipId"], unique: true },
    ],
  }
);

Membership.hasMany(MemberAgentVisibility, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
AgentConfiguration.hasMany(MemberAgentVisibility, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

MemberAgentVisibility.addHook(
  "beforeCreate",
  "only_one_listing_for_private_agent",
  async (memberAgentList) => {
    const agentConfiguration = await AgentConfiguration.findOne({
      where: {
        id: memberAgentList.dataValues.agentConfigurationId,
      },
    });
    if (!agentConfiguration)
      throw new Error("Unexpected: Agent configuration not found");
    if (agentConfiguration.scope === "private") {
      const existingMemberAgentList = await MemberAgentVisibility.findOne({
        where: {
          agentConfigurationId: memberAgentList.dataValues.agentConfigurationId,
        },
      });
      assert(!existingMemberAgentList);
    }
  }
);
