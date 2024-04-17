import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { LabsTranscriptsProviderType } from "@app/lib/labs/transcripts/utils/types";
import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";

export class LabsTranscriptsConfigurationModel extends Model<
  InferAttributes<LabsTranscriptsConfigurationModel>,
  InferCreationAttributes<LabsTranscriptsConfigurationModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<User["id"]>;
  declare connectionId: string;
  declare provider: LabsTranscriptsProviderType;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["sId"]> | null;
  declare emailToNotify: string | null;
  declare isActive: boolean;
}

LabsTranscriptsConfigurationModel.init(
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
    },
    emailToNotify: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "labs_transcripts_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["provider", "connectionId"], unique: true },
    ],
  }
);

User.hasMany(LabsTranscriptsConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
LabsTranscriptsConfigurationModel.belongsTo(User, {
  foreignKey: {
    name: "userId", allowNull: false
  },
});
