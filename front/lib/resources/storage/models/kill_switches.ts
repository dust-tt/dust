import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import type { KillSwitchType } from "@app/lib/poke/types";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class KillSwitchModel extends BaseModel<KillSwitchModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare type: KillSwitchType;
}
KillSwitchModel.init(
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "kill_switches",
    tableName: "kill_switches",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["type"] }],
  }
);
