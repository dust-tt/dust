import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";

export class LabsTranscriptsConfigurationModel extends Model<
  InferAttributes<LabsTranscriptsConfigurationModel>,
  InferCreationAttributes<LabsTranscriptsConfigurationModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
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
    workspaceId: {
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
});
Workspace.hasMany(LabsTranscriptsConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
LabsTranscriptsConfigurationModel.belongsTo(User, {
  foreignKey: {
    name: "userId",
    allowNull: false,
  },
});
LabsTranscriptsConfigurationModel.belongsTo(Workspace, {
  foreignKey: {
    name: "workspaceId",
    allowNull: false,
  },
});

export class LabsTranscriptsHistoryModel extends Model<
  InferAttributes<LabsTranscriptsHistoryModel>,
  InferCreationAttributes<LabsTranscriptsHistoryModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare configurationId: ForeignKey<LabsTranscriptsConfigurationModel["id"]>;
  declare fileId: string;
  declare fileName: string;
  declare configuration: NonAttribute<LabsTranscriptsConfigurationModel>;
}

LabsTranscriptsHistoryModel.init(
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
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "labs_transcripts_history",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["configurationId"] },
      { fields: ["fileId"], unique: true },
    ],
  }
);

LabsTranscriptsHistoryModel.belongsTo(LabsTranscriptsConfigurationModel, {
  as: "configuration",
  foreignKey: {
    name: "configurationId",
    allowNull: false,
  },
});

LabsTranscriptsConfigurationModel.hasMany(LabsTranscriptsHistoryModel, {
  as: "configuration",
  foreignKey: { allowNull: false },
});
