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

export class SolutionsTranscriptsHistoryModel extends Model<
  InferAttributes<SolutionsTranscriptsHistoryModel>,
  InferCreationAttributes<SolutionsTranscriptsHistoryModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<User["id"]>;
  declare fileId: string;
  declare fileName: string;
}

SolutionsTranscriptsHistoryModel.init(
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
    modelName: "solutions_transcripts_history",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["fileId"], unique: true },
    ],
  }
);
