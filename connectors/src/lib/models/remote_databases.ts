import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

type RemoteTablePermission = "selected" | "inherited"; // todo Daph move in next PR

export class RemoteDatabaseModel extends Model<
  InferAttributes<RemoteDatabaseModel>,
  InferCreationAttributes<RemoteDatabaseModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare internalId: string;
  declare name: string;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
RemoteDatabaseModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    internalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
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
  },
  {
    sequelize: sequelizeConnection,
    modelName: "remote_databases",
    indexes: [{ fields: ["connectorId", "internalId"], unique: true }],
  }
);
ConnectorModel.hasMany(RemoteDatabaseModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
RemoteDatabaseModel.belongsTo(ConnectorModel);

export class RemoteSchemaModel extends Model<
  InferAttributes<RemoteSchemaModel>,
  InferCreationAttributes<RemoteSchemaModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare internalId: string;
  declare name: string;

  declare databaseName: string;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
RemoteSchemaModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    internalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    databaseName: {
      type: DataTypes.STRING,
      allowNull: false,
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
  },
  {
    sequelize: sequelizeConnection,
    modelName: "remote_schemas",
    indexes: [{ fields: ["connectorId", "internalId"], unique: true }],
  }
);
ConnectorModel.hasMany(RemoteSchemaModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
RemoteSchemaModel.belongsTo(ConnectorModel);

export class RemoteTableModel extends Model<
  InferAttributes<RemoteTableModel>,
  InferCreationAttributes<RemoteTableModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastUpsertedAt: CreationOptional<Date> | null;

  declare internalId: string;
  declare name: string;

  declare schemaName: string;
  declare databaseName: string;
  declare permission: RemoteTablePermission;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
RemoteTableModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    internalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    schemaName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    databaseName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
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
    lastUpsertedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "remote_tables",
    indexes: [{ fields: ["connectorId", "internalId"], unique: true }],
  }
);
ConnectorModel.hasMany(RemoteTableModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
RemoteTableModel.belongsTo(ConnectorModel);
