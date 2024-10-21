import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export class ZendeskConfiguration extends Model<
  InferAttributes<ZendeskConfiguration>,
  InferCreationAttributes<ZendeskConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationsSlidingWindow: number;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskConfiguration.init(
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
    conversationsSlidingWindow: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 90,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "zendesk_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
ConnectorModel.hasMany(ZendeskConfiguration, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
ZendeskConfiguration.belongsTo(ConnectorModel);
