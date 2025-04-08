import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class PersonalConnection extends WorkspaceAwareModel<PersonalConnection> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string;
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare dataSourceId: ForeignKey<DataSourceModel["id"]> | null;
}
PersonalConnection.init(
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
    connectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "personal_connection",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "userId", "dataSourceId"], unique: true },
    ],
  }
);

UserModel.hasMany(PersonalConnection, {
  foreignKey: "userId",
});

DataSourceModel.hasMany(PersonalConnection, {
  foreignKey: "dataSourceId",
});
