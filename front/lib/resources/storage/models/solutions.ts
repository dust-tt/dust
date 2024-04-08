import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import type { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";
import type { SolutionProviderType } from "@app/lib/solutions/transcripts/utils/types";

export class SolutionsTranscriptsConfigurationModel extends Model<
  InferAttributes<SolutionsTranscriptsConfigurationModel>,
  InferCreationAttributes<SolutionsTranscriptsConfigurationModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<User["id"]>;
  declare connectionId: string;
  declare provider: SolutionProviderType;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["sId"]> | null;
}

SolutionsTranscriptsConfigurationModel.init(
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
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "id",
      },
    },
    connectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "agent_configurations",
        key: "sId",
      },
    },
  },
  {
    modelName: "solutions_transcripts_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["provider", "connectionId"], unique: true },
    ],
  }
);
