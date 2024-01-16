import type {
  EventSchemaPropertyType,
  EventSchemaStatus,
} from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";

export class EventSchema extends Model<
  InferAttributes<EventSchema>,
  InferCreationAttributes<EventSchema>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare sId: string;

  declare marker: string;
  declare description: string | null;
  declare status: EventSchemaStatus;
  declare debug: boolean | null;
  declare properties: EventSchemaPropertyType[];
  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
EventSchema.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    marker: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    debug: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    properties: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    modelName: "event_schema",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId", "marker"], unique: true },
      { fields: ["sId"], unique: true },
    ],
  }
);
Workspace.hasMany(EventSchema, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
User.hasMany(EventSchema, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class ExtractedEvent extends Model<
  InferAttributes<ExtractedEvent>,
  InferCreationAttributes<ExtractedEvent>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare sId: string;

  declare marker: string;
  declare properties: any;
  declare status: "pending" | "accepted" | "rejected";

  declare eventSchemaId: ForeignKey<EventSchema["id"]>;

  declare dataSourceName: string;
  declare documentId: string;
  declare documentSourceUrl: string | null;
}
ExtractedEvent.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    marker: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "",
    },
    properties: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    dataSourceName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    documentSourceUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "extracted_event",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["eventSchemaId"] },
      { fields: ["dataSourceName", "documentId"] },
      { fields: ["sId"], unique: true },
    ],
  }
);
EventSchema.hasMany(ExtractedEvent, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE", // @todo daph define if we really want to delete the extracted event when the schema is deleted
});
