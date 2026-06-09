import { connectorsSequelize } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CreationOptional } from "sequelize";
import { DataTypes, DANGEROUSLY_UNBOUNDED_TEXT } from "@connectors/resources/storage/data_types";

type AllowedPermissions = "selected" | "unselected" | "inherited";

export class RemoteDatabaseModel extends ConnectorBaseModel<RemoteDatabaseModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastUpsertedAt: CreationOptional<Date> | null;

  declare internalId: string;
  declare name: string;
  declare permission: AllowedPermissions;
}
RemoteDatabaseModel.init(
  {
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
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "remote_databases",
    indexes: [{ fields: ["connectorId", "internalId"], unique: true }],
  }
);

export class RemoteSchemaModel extends ConnectorBaseModel<RemoteSchemaModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastUpsertedAt: CreationOptional<Date> | null;

  declare internalId: string;
  declare name: string;
  declare permission: AllowedPermissions;

  declare databaseName: string;
}
RemoteSchemaModel.init(
  {
    internalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    permission: {
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
    lastUpsertedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "remote_schemas",
    indexes: [{ fields: ["connectorId", "internalId"], unique: true }],
  }
);

export class RemoteTableModel extends ConnectorBaseModel<RemoteTableModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastUpsertedAt: CreationOptional<Date> | null;

  declare internalId: string;
  declare name: string;

  declare schemaName: string;
  declare databaseName: string;
  declare permission: AllowedPermissions;
}
RemoteTableModel.init(
  {
    internalId: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    name: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    schemaName: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    databaseName: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
    sequelize: connectorsSequelize,
    modelName: "remote_tables",
    indexes: [{ fields: ["connectorId", "internalId"], unique: true }],
  }
);
