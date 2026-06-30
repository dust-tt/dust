import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import type { SandboxFunctionInvocationStatus } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_INVOCATION_STATUSES } from "@app/types/api/sandbox_functions";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

function validateSandboxFunctionJsonSchema(value: unknown): void {
  if (typeof value !== "object" && typeof value !== "string") {
    throw new Error("JSON schema is not an object or a string");
  }

  const validationResult = validateJsonSchema(value);
  if (!validationResult.isValid) {
    throw new Error(`Invalid JSON schema: ${validationResult.error}`);
  }
}

// Lowercase alphanumeric with single hyphen separators (e.g. `greet`, `send-slack-message`).
export const SANDBOX_FUNCTION_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSandboxFunctionSlug(value: unknown): value is string {
  return typeof value === "string" && SANDBOX_FUNCTION_SLUG_REGEX.test(value);
}

function validateSandboxFunctionSlug(value: unknown): void {
  if (!isValidSandboxFunctionSlug(value)) {
    throw new Error(
      "Slug must be lowercase alphanumeric with single hyphen separators."
    );
  }
}

export class SandboxFunctionModel extends WorkspaceAwareModel<SandboxFunctionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare fileId: ForeignKey<FileModel["id"]>;
  declare slug: string;
  declare description: string;
  declare inputSchema: JSONSchema;
  declare outputSchema: JSONSchema;

  declare space: NonAttribute<SpaceModel>;
  declare file: NonAttribute<FileModel>;
}

export class SandboxFunctionInvocationModel extends WorkspaceAwareModel<SandboxFunctionInvocationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sandboxFunctionId: ForeignKey<SandboxFunctionModel["id"]>;
  declare status: SandboxFunctionInvocationStatus;

  declare sandboxFunction: NonAttribute<SandboxFunctionModel>;
}

SandboxFunctionModel.init(
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
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isValidSlug: validateSandboxFunctionSlug,
      },
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    inputSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidJSONSchema: validateSandboxFunctionJsonSchema,
      },
    },
    outputSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidJSONSchema: validateSandboxFunctionJsonSchema,
      },
    },
  },
  {
    modelName: "sandbox_function",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "spaceId", "fileId"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["workspaceId", "spaceId", "slug"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["spaceId"],
        concurrently: true,
      },
      {
        fields: ["fileId"],
        unique: true,
        concurrently: true,
      },
    ],
  }
);

SandboxFunctionModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
  as: "space",
});

SpaceModel.hasMany(SandboxFunctionModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "sandboxFunctions",
});

SandboxFunctionModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
  as: "file",
});

FileModel.hasMany(SandboxFunctionModel, {
  foreignKey: { name: "fileId", allowNull: false },
  as: "sandboxFunctions",
});

SandboxFunctionInvocationModel.init(
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
    sandboxFunctionId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: {
        isIn: [SANDBOX_FUNCTION_INVOCATION_STATUSES],
      },
    },
  },
  {
    modelName: "sandbox_function_invocation",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["sandboxFunctionId"],
        concurrently: true,
      },
    ],
  }
);

SandboxFunctionInvocationModel.belongsTo(SandboxFunctionModel, {
  foreignKey: { name: "sandboxFunctionId", allowNull: false },
  onDelete: "RESTRICT",
  as: "sandboxFunction",
});

SandboxFunctionModel.hasMany(SandboxFunctionInvocationModel, {
  foreignKey: { name: "sandboxFunctionId", allowNull: false },
  as: "invocations",
});
