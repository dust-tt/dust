import {
  type CreationOptional,
  DataTypes,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";

import { sequelize_conn } from "@connectors/lib/models";

import { GoogleDriveFiles } from "./google_drive";

export class Database extends Model<
  InferAttributes<Database>,
  InferCreationAttributes<Database>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare coreDatabaseId: string;

  declare googleDriveFileId: ForeignKey<GoogleDriveFiles["id"]>;
}

Database.init(
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

    coreDatabaseId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "databases",
    indexes: [
      { fields: ["googleDriveFileId"], unique: true },
      { fields: ["coreDatabaseId"], unique: true },
    ],
  }
);

GoogleDriveFiles.hasOne(Database, {
  foreignKey: "googleDriveFileId",
  as: "database",
});
Database.belongsTo(GoogleDriveFiles, {
  foreignKey: "googleDriveFileId",
  as: "googleDriveFile",
});
