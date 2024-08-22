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
import type { DataSource } from "@app/lib/models/data_source";
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
  declare isActive: boolean;
  declare dataSourceId: ForeignKey<DataSource["name"]> | null;
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
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    dataSourceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "labs_transcripts_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["userId", "workspaceId"], unique: true },
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

  declare fileId: string;
  declare fileName: string;

  declare conversationId: string | null;

  declare configurationId: ForeignKey<LabsTranscriptsConfigurationModel["id"]>;

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
    conversationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "labs_transcripts_history",
    sequelize: frontSequelize,
    indexes: [{ fields: ["fileId"], unique: true }],
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
  foreignKey: { name: "configurationId", allowNull: false },
});
