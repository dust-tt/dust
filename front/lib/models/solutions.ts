import type { SolutionProviderType } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";

export class SolutionsMeetingsTranscriptsConfiguration extends Model<
  InferAttributes<SolutionsMeetingsTranscriptsConfiguration>,
  InferCreationAttributes<SolutionsMeetingsTranscriptsConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<User["id"]>;
  declare connectionId: string | null;
  declare provider: SolutionProviderType;
}

SolutionsMeetingsTranscriptsConfiguration.init(
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
  },
  {
    modelName: "solutions_meetings_transcripts_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["provider", "connectionId"], unique: true },
    ],
  }
);