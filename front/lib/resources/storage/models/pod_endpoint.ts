import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

function validateEndpointJsonSchema(value: unknown): void {
  if (typeof value !== "object" && typeof value !== "string") {
    throw new Error("JSON schema is not an object or a string");
  }

  const validationResult = validateJsonSchema(value);
  if (!validationResult.isValid) {
    throw new Error(`Invalid JSON schema: ${validationResult.error}`);
  }
}

export class PodEndpointModel extends WorkspaceAwareModel<PodEndpointModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare podId: ForeignKey<SpaceModel["id"]>;
  declare fileId: ForeignKey<FileModel["id"]>;
  declare inputSchema: JSONSchema;
  declare outputSchema: JSONSchema;

  declare pod: NonAttribute<SpaceModel>;
  declare file: NonAttribute<FileModel>;
}

PodEndpointModel.init(
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
    podId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    inputSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidJSONSchema: validateEndpointJsonSchema,
      },
    },
    outputSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidJSONSchema: validateEndpointJsonSchema,
      },
    },
  },
  {
    modelName: "pod_endpoint",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "podId", "fileId"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["podId"],
        concurrently: true,
      },
      {
        fields: ["fileId"],
        concurrently: true,
      },
    ],
  }
);

PodEndpointModel.belongsTo(SpaceModel, {
  foreignKey: { name: "podId", allowNull: false },
  onDelete: "RESTRICT",
  as: "pod",
});

SpaceModel.hasMany(PodEndpointModel, {
  foreignKey: { name: "podId", allowNull: false },
  as: "podEndpoints",
});

PodEndpointModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
  as: "file",
});

FileModel.hasMany(PodEndpointModel, {
  foreignKey: { name: "fileId", allowNull: false },
  as: "podEndpoints",
});
